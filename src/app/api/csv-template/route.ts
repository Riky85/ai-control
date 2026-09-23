export function GET() {
  const csv = [
    "name,vendor,type,model,owner_email,department,monthly_cost",
    "Customer Support Agent,OpenAI,AI_AGENT,gpt-5,support.lead@example.com,Support,3840",
    "Marketing Copy,Anthropic,AI_APPLICATION,claude-sonnet-4-6,marketing@example.com,Marketing,2120",
  ].join("\n");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="ai-systems-template.csv"' },
  });
}
