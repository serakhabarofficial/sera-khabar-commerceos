-- Returning-buyer recognition looks up a browser's most recent order by its ms_vid visitor id.
create index if not exists analytics_order_facts_org_visitor_idx
  on public.analytics_order_facts (org_id, visitor_id, submitted_at desc);
