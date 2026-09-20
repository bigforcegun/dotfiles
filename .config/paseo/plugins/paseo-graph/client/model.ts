/**
 * What the graph is made of, and how the daemon's catalogue becomes it. Nothing
 * here knows about React, pixels or the physics that will later move the nodes.
 */

export type NodeKind = "project" | "workspace" | "agent";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  refId: string;
  label: string;
  sublabel: string;
  status: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: "contains" | "spawn";
}

export interface WorkspaceInfo {
  id: string;
  projectId: string;
  projectName: string;
  label: string;
  status: string;
  kind: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  key: string | null;
  rootPath: string | null;
}

/**
 * The live catalogue can repeat an id across cursor pages, which would emit
 * duplicate React keys. Last write wins.
 */
function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) byId.set(item.id, item);
  return [...byId.values()];
}

export interface AgentInfo {
  id: string;
  label: string;
  provider: string;
  status: string;
  workspaceId: string | null;
  parentId: string | null;
  archived: boolean;
  projectKey: string | null;
  projectRoot: string | null;
}

/**
 * Paseo records agent parentage as an ordinary label rather than a snapshot
 * field, which is why `agents.list()` looks like it has no parent link.
 */
const PARENT_AGENT_ID_LABEL = "paseo.parent-agent-id";

export function parentFromLabels(labels: Record<string, string> | undefined): string | null {
  const raw = labels?.[PARENT_AGENT_ID_LABEL];
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

/**
 * The SDK's list payloads are zod-inferred across a bundled protocol copy, so
 * their element types collapse to `any` here. These describe the fields this
 * surface actually reads, verified against the daemon's fetch_workspaces /
 * fetch_agents response schemas.
 */

const projectNodeId = (id: string) => `project:${id}`;

const workspaceNodeId = (id: string) => `workspace:${id}`;

const agentNodeId = (id: string) => `agent:${id}`;

/**
 * Paseo never records "this workspace was created by that agent", and a parent
 * sitting elsewhere does not prove it: an agent can be started in any existing
 * workspace. Only the recorded parent-agent link is drawn.
 */
export function buildGraph(
  rawWorkspaces: WorkspaceInfo[],
  rawAgents: AgentInfo[],
  projects: ProjectInfo[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const workspaces = dedupeById(rawWorkspaces);
  const agents = dedupeById(rawAgents);
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const seenProjects = new Set<string>();
  const agentById = new Map<string, AgentInfo>();
  const knownWorkspaces = new Set(workspaces.map((workspace) => workspace.id));

  const addProjectNode = (projectId: string, name: string) => {
    if (seenProjects.has(projectId)) return;
    seenProjects.add(projectId);
    nodes.set(projectNodeId(projectId), {
      id: projectNodeId(projectId),
      kind: "project",
      refId: projectId,
      label: name,
      sublabel: "project",
      status: "project",
    });
  };

  for (const workspace of workspaces) {
    addProjectNode(workspace.projectId, workspace.projectName);
    nodes.set(workspaceNodeId(workspace.id), {
      id: workspaceNodeId(workspace.id),
      kind: "workspace",
      refId: workspace.id,
      label: workspace.label,
      sublabel: workspace.kind,
      status: workspace.status,
    });
    edges.push({
      id: `c:${workspace.projectId}:${workspace.id}`,
      from: projectNodeId(workspace.projectId),
      to: workspaceNodeId(workspace.id),
      kind: "contains",
    });
  }

  // Every project the daemon knows, including ones whose workspaces are all
  // archived - otherwise their agents would have nothing to hang from.
  const projectIdByKey = new Map<string, string>();
  const projectIdByRoot = new Map<string, string>();
  for (const project of projects) {
    addProjectNode(project.id, project.name);
    if (project.key) projectIdByKey.set(project.key, project.id);
    if (project.rootPath) projectIdByRoot.set(project.rootPath, project.id);
  }

  for (const agent of agents) {
    agentById.set(agent.id, agent);
    nodes.set(agentNodeId(agent.id), {
      id: agentNodeId(agent.id),
      kind: "agent",
      refId: agent.id,
      label: agent.label,
      sublabel: agent.provider,
      status: agent.archived ? "archived" : agent.status,
    });
  }

  for (const agent of agents) {
    const parent = agent.parentId ? agentById.get(agent.parentId) : undefined;

    if (agent.workspaceId && knownWorkspaces.has(agent.workspaceId)) {
      edges.push({
        id: `c:${agent.workspaceId}:${agent.id}`,
        from: workspaceNodeId(agent.workspaceId),
        to: agentNodeId(agent.id),
        kind: "contains",
      });
    } else {
      // The daemon only lists active workspaces, so an archived agent's
      // workspace is usually gone. Its project is still known by key, which
      // keeps the agent attached instead of floating free.
      // Two exact lookups, no guessing: the project key the agent reports, then
      // its repository root. Either identifies the project outright.
      const projectId =
        (agent.projectKey ? projectIdByKey.get(agent.projectKey) : undefined) ??
        (agent.projectRoot ? projectIdByRoot.get(agent.projectRoot) : undefined);
      if (projectId && seenProjects.has(projectId)) {
        edges.push({
          id: `c:${projectId}:${agent.id}`,
          from: projectNodeId(projectId),
          to: agentNodeId(agent.id),
          kind: "contains",
        });
      }
    }

    if (!parent) continue;
    edges.push({
      id: `s:${parent.id}:${agent.id}`,
      from: agentNodeId(parent.id),
      to: agentNodeId(agent.id),
      kind: "spawn",
    });
  }

  const dedupedEdges = new Map<string, GraphEdge>();
  for (const edge of edges) dedupedEdges.set(edge.id, edge);
  return { nodes: [...nodes.values()], edges: [...dedupedEdges.values()] };
}
