# frozen_string_literal: true

# очень стремный кот, который очень хитровыебанным образом сортирует загрузки
# можно в 100 раз проще, если запускать на одну папку
# если пойму это через неделю, то куплю себе пива

require 'notify-send'
require 'maid'

TRASH_ENABLED = false
ARCHIVE_DIR = '~/downloads/archive'

DOWNLOAD_ROOT = '~/downloads'

SUB_DOWNLOAD_DIRS = [
  # "~/#{DOWNLOAD_ROOT}/browser",
  "#{DOWNLOAD_ROOT}/slack",
  "#{DOWNLOAD_ROOT}/Telegram Desktop"
].freeze

TRASH_PATTERNS = %w[**/__MACOSX **/.DS_Store].freeze

BASE_RULES = [
  {
    name: 'documents',
    exts: %w[pdf doc docx xsl xslx csv key odf odt mm txt md],
    archive_after: 1.week,
    trash_after: 112.weeks,
    check_archives: true
  },
  {
    name: 'books',
    exts: %w[epub fb2],
    archive_after: 1.week,
    trash_after: 10.weeks,
    check_archives: true
  },
  {
    name: 'torrents',
    exts: %w[torrent],
    archive_after: 1.week,
    trash_after: 3.weeks,
    check_archives: false
  },
  {
    name: 'fonts',
    exts: %w[ttf],
    archive_after: 1.week,
    trash_after: 20.weeks,
    check_archives: true
  },
  {
    name: 'logs',
    exts: %w[log log.gz log.tar.gz log.zip log.tgz],
    archive_after: 1.week,
    trash_after: 20.weeks,
    check_archives: true
  },
  {
    name: 'dumps',
    exts: %w[json sql html],
    archive_after: 1.week,
    trash_after: 20.weeks,
    check_archives: true
  },
  {
    name: 'software',
    exts: %w[dmg app pkg wdgt jar jnlp exe AppImage],
    patterns: %w[*linux*.tar.gz *linux*.zip *jar*.zip],
    archive_after: 1.day,
    trash_after: nil,
    check_archives: true
  },
  {
    name: 'video',
    exts: %w[m4v mov],
    archive_after: 2.days,
    trash_after: 56.weeks,
    check_archives: false
  },
  {
    name: 'pictures',
    exts: %w[png jpg jpeg gif],
    archive_after: 1.week,
    trash_after: 56.weeks,
    check_archives: false
  },
  {
    name: 'archives',
    exts: %w[zip tar.gz gz rar tgz], # GERMAN WHY tgz
    archive_after: 1.week,
    trash_after: 10.weeks,
    check_archives: false
  }
].freeze

def archive_root(_base)
  # File.join base, 'archive'
  ARCHIVE_DIR
end

def archive_and_retain_dirs(base, name, archive_after, trash_after)
  rule "Archive/retain dirs for root - #{base}" do
    archive_path = File.join archive_root(base), name
    dirs_matcher = '*'
    mkdir(archive_path) unless File.directory?(File.expand_path(archive_path))

    # trash old directories
    if TRASH_ENABLED && !trash_after.nil?
      dir(File.join(archive_path, dirs_matcher)).each do |path|
        trash(path) if trash_after.since?(accessed_at(path)) && File.directory?(path)
      end
    end

    # archive directories
    dir(File.join(base, dirs_matcher)).each do |path|
      move(path, archive_path) if archive_after.since?(modified_at(path)) && File.directory?(path)
    end
  end
end

def archive_and_retain_file(base, name:, exts: [], patterns: [], archive_after: nil, trash_after: nil, check_archives: false)
  rule "Archive/retain file #{name} for root - #{base}" do
    archive_path = File.join archive_root(base), name
    file_matcher = "*.{#{exts.join(',')}}"
    file_matcher = "{#{file_matcher},#{patterns.join(',')}}" if !patterns.nil? && !patterns.empty?
    mkdir(archive_path) unless File.directory?(File.expand_path(archive_path))

    # trash old files
    if TRASH_ENABLED && !trash_after.nil?
      dir(File.join(archive_path, file_matcher)).each do |path|
        trash(path) if trash_after.since?(accessed_at(path))
      end
    end

    # archive files
    dir(File.join(base, file_matcher)).each do |path|
      move(path, archive_path) if archive_after.since?(modified_at(path))
    end

    # check zip archives content
    if check_archives
      # if false # bad idea, but i keep that code
      dir(File.join(base, '*.zip')).each do |zipfile|
        next if size_of(zipfile) > 100_000_000

        has_contents = zipfile_contents(zipfile).any? { |path| exts.map { |e| ".#{e}" }.member?(File.extname(path)) }

        move(zipfile, archive_path) if has_contents && archive_after.since?(modified_at(zipfile))
      end
      if TRASH_ENABLED && !trash_after.nil?

        dir(File.join(archive_path, '*.zip')).each do |zipfile|
          next if size_of(zipfile) > 100_000_000

          has_contents = zipfile_contents(zipfile).any? { |path| exts.map { |e| ".#{e}" }.member?(File.extname(path)) }

          trash(zipfile) if has_contents && trash_after.since?(accessed_at(zipfile))
        end
      end
    end
  end
end

# Return glob patterns for root download dir
# @param [Array<String>] patterns
def ddr(patterns)
  patterns.map { |pp| "#{DOWNLOAD_ROOT}/#{pp}" }
end

# Return glob patterns for ALL downloads dirs
# @param [Array<String>] patterns
def dds_all(patterns)
  patterns.map { |pp| (SUB_DOWNLOAD_DIRS + [DOWNLOAD_ROOT]).map { |dd| "#{dd}/#{pp}" } }.flatten
end

Maid.rules do
  rule 'Remove empty directories' do
    dir(dds_all(['*'])).each do |path|
      trash(path) if File.directory?(path) && tree_empty?(path)
    end
  end

  rule 'Trash duplicate downloads' do
    # trash verbose_dupes_in(dd('*'))
    trash verbose_dupes_in(dds_all(['*/*']))
  end

  rule "Trash files that shouldn't have been downloaded" do
    trash(dir(dds_all(TRASH_PATTERNS)))
  end

  rule 'Trash incomplete downloads' do
    trash(dir(ddr(%w[*.download *.part *.crdownload]))).select { |path| 3.days.since modified_at path }
  end

  BASE_RULES.each do |r|
    # archive_and_retain_file(DOWNLOAD_ROOT, r[:to], exts: r[:types], patterns: r[:patterns], archive_after: r[:archive_after], trash_after: r[:trash_after], check_archives: r[:check_archives])
    archive_and_retain_file(DOWNLOAD_ROOT, **r)
    SUB_DOWNLOAD_DIRS.map { |ddir| archive_and_retain_file(ddir, **r) }
  end

  (SUB_DOWNLOAD_DIRS + [DOWNLOAD_ROOT]).map { |ddir| archive_and_retain_dirs(ddir, 'unsorted', 5.days, 20.weeks) }

  rule 'Maid notify' do
    NotifySend.send 'Maid', "🙇 I'm done,boss."
  end
end
