import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { test, expect } from "@playwright/test";

loadEnvConfig(process.cwd());

type Scenario = { person: string; name: string; destination: string; origin: string; days: string; travelers: string; vibe: string; questions: (destination: string) => string[] };

const questionJourney = (destination: string) => [
  `This is our first time in ${destination}. What should we understand before choosing where to stay?`,
  "Based on our trip profile, what pace would you recommend?",
  "What are the top areas or cities we should consider?",
  "Which option is best for our group and why?",
  "What would you remove if we only have a few days?",
  "What are the most important sights for first-time visitors?",
  "We want experiences that feel local rather than generic. What fits?",
  "Are there historic places worth prioritizing?",
  "What architecture or cultural sites should we see?",
  "Are there religious or sacred places we can visit respectfully?",
  "What markets or local-food areas should we explore?",
  "Where could we take a cooking class or food tour?",
  "What are good restaurants for our group and budget?",
  "What nightlife or evening activities fit our situation?",
  "What can we do on a rainy day?",
  "Are there beaches, mountains, parks, or nature experiences nearby?",
  "Are there unusual or adventurous activities available?",
  "Could we do a guided tour, and what kind would be worthwhile?",
  "What activities need advance reservations?",
  "What is a realistic day plan without rushing?",
  "How should we divide the trip between different areas?",
  "Is it better to stay in one base or move hotels?",
  "Which neighborhood is most practical for us?",
  "What should we know about accessibility and walking distances?",
  "What should we know about safety for this kind of group?",
  "What scams or tourist traps should we avoid?",
  "What local customs should we respect?",
  "What language or useful phrases should we learn?",
  "How do we get from our starting point to the destination?",
  "How should we move around once we arrive?",
  "When does public transit make more sense than taxis?",
  "Can we walk between the places you recommended?",
  "What transport should we use late at night?",
  "What weather should we plan for during our trip?",
  "Which activities are most sensitive to weather?",
  "Are there events, festivals, concerts, or games during our dates?",
  "What information needs to be checked again close to departure?",
  "Can you give us official links for the most important places?",
  "Can you show verified photos of the best options?",
  "What is the difference between an estimate and a confirmed price here?",
  "How can we keep this trip within our budget?",
  "What should we spend more on, and where can we save?",
  "What should we pack for this trip?",
  "What practical essentials, tickets, or connectivity should we arrange?",
  "What should be our backup plan if a booking or activity is unavailable?",
  "Please summarize the best plan for our group in a short itinerary.",
  "What have we already decided or added to our trip?",
  "What important decision have we not made yet?",
  "If we change one day, what part of the plan is affected?",
  "Give us the final top six recommendations, with no duplicates."
];

const scenarios: Scenario[] = [
  { person: "Navi", name: "Friends India Adventure", destination: "India", origin: "Canada", days: "10", travelers: "5", vibe: "friends, nightlife, culture, adventure", questions: questionJourney },
  { person: "Aisha", name: "Family Japan Discovery", destination: "Japan", origin: "Canada", days: "12", travelers: "4", vibe: "two adults, two children, food, safe, relaxed", questions: questionJourney },
  { person: "Daniel", name: "Budget Portugal Escape", destination: "Portugal", origin: "Canada", days: "5", travelers: "2", vibe: "budget, architecture, local food, walking", questions: questionJourney },
  { person: "Sofia", name: "Anniversary Costa Rica", destination: "Costa Rica", origin: "Canada", days: "8", travelers: "2", vibe: "anniversary, nature, beaches, slower pace", questions: questionJourney },
];

test("four real-life trips each survive a 50-question personalized conversation", async ({ page }) => {
  test.setTimeout(3_600_000);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const report: Array<Record<string, unknown>> = [];
  for (const scenario of scenarios) {
    const email = `qa-${scenario.person.toLowerCase()}-${crypto.randomUUID()}@example.invalid`;
    const password = `QA-${crypto.randomUUID()}-test`;
    let userId: string | undefined;
    let tripId: string | undefined;
    try {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) throw created.error;
      userId = created.data.user.id;
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/trips$/);
      await page.goto("/trips/new");
      for (const [label, value] of [["Trip name", scenario.name], ["Destination", scenario.destination], ["Starting from", scenario.origin], ["Days", scenario.days], ["Travelers", scenario.travelers], ["Vibe", scenario.vibe]] as const) await page.getByLabel(label).fill(value);
      await page.getByRole("button", { name: "Create trip" }).click();
      await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/i);
      tripId = page.url().split("/").pop();
      const seeded = await page.evaluate(async (id) => { const response = await fetch(`/api/trips/${id}/itinerary`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Arrival day placeholder", dayIndex: 1 }) }); return response.status; }, tripId);
      expect(seeded).toBe(201);
      for (const [index, prompt] of scenario.questions(scenario.destination).entries()) {
        const before = await page.evaluate(async (id) => (await (await fetch(`/api/trips/${id}/conversation`)).json()).messages?.filter((m: { role: string }) => m.role === "assistant").length ?? 0, tripId);
        const messageKey = `qa-${scenario.person}-${index}-${crypto.randomUUID()}`;
        const requestStatus = await page.evaluate(async ({ id, prompt: content, key }) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 20_000);
          let saved: Response;
          try {
            saved = await fetch(`/api/trips/${id}/conversation`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "user", content, idempotencyKey: key }), signal: controller.signal });
          } catch {
            clearTimeout(timeout);
            return { saved: 598, ai: 0 };
          }
          if (!saved.ok) { clearTimeout(timeout); return { saved: saved.status, ai: 0 }; }
          const aiController = new AbortController();
          const aiTimeout = setTimeout(() => aiController.abort(), 20_000);
          let ai: Response;
          try {
            ai = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId: id, messages: [{ role: "user", content }], messageIdempotencyKey: key }), signal: aiController.signal });
          } catch {
            clearTimeout(aiTimeout);
            return { saved: saved.status, ai: 598 };
          }
          clearTimeout(aiTimeout);
          await ai.text();
          return { saved: saved.status, ai: ai.status };
        }, { id: tripId, prompt, key: messageKey });
        if (requestStatus.saved !== 201 || requestStatus.ai !== 200) {
          report.push({ person: scenario.person, index: index + 1, prompt, status: "request_failed", requestStatus });
          console.log(`SIMULATION ${scenario.person} ${index + 1}/50 request_failed ${JSON.stringify(requestStatus)}`);
          continue;
        }
        let answer = "";
        try {
          await expect.poll(async () => page.evaluate(async ({ id, count }) => { const body = await (await fetch(`/api/trips/${id}/conversation`)).json(); const messages = body.messages?.filter((m: { role: string }) => m.role === "assistant") ?? []; return messages.length > count ? messages.at(-1)?.content ?? "" : ""; }, { id: tripId, count: before }), { timeout: 20_000 }).toBeTruthy();
          answer = await page.evaluate(async (id) => { const body = await (await fetch(`/api/trips/${id}/conversation`)).json(); return body.messages?.filter((m: { role: string }) => m.role === "assistant").at(-1)?.content ?? ""; }, tripId);
        } catch (error) {
          report.push({ person: scenario.person, index: index + 1, prompt, status: "timeout", error: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
          continue;
        }
        report.push({ person: scenario.person, index: index + 1, prompt, status: "answered", chars: answer.length, links: (answer.match(/https:\/\//g) ?? []).length, photos: (answer.match(/\/api\/trips\/.*?\/places\/google\/photo/g) ?? []).length, refusal: /couldn.t verify|no verified .* information|no results/i.test(answer), mentionsDestination: answer.toLowerCase().includes(scenario.destination.split(",")[0].toLowerCase()), mentionsSeededItinerary: /arrival day placeholder/i.test(answer) });
        console.log(`SIMULATION ${scenario.person} ${index + 1}/50 answered`);
      }
    } finally {
      if (tripId) await admin.from("trips").delete().eq("id", tripId);
      if (userId) await admin.auth.admin.deleteUser(userId);
    }
  }
  console.log("FOUR_TRIP_50_QUESTION_REPORT=" + JSON.stringify(report));
  expect(report).toHaveLength(200);
  expect(report.filter((item) => item.status === "answered" || item.status === "request_failed")).toHaveLength(200);
  expect(report.filter((item) => item.mentionsSeededItinerary).length).toBeGreaterThanOrEqual(4);
});
