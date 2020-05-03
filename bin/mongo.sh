mongoexport \
  --uri="mongodb://kb@ws.office/connect_staging?authsource=admin" \
  -c queues_schedule_changes \
  --fields token,gds,record_locator,change_type,processed_at \
  --type=csv \
  --query='{change_type: "cancel", processed_at: {$gte: ISODate("2020-02-01T00:00:00.000Z"),$lt: ISODate("2020-04-22T00:00:00.000Z")}}' \
  --out ./schedule_cancelled.csv