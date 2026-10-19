const RACING_COM_GRAPHQL = "https://graphql.rmdprod.racing.com/";
const RACING_COM_API_KEY = "da2-6nsi4ztsynar3l3frgxf77q5fe";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

async function queryRacingCom(query: string, variables: Record<string, unknown>) {
  const url = new URL(RACING_COM_GRAPHQL);
  url.searchParams.set("query", query);
  url.searchParams.set("variables", JSON.stringify(variables));
  const response = await fetch(url, {
    headers: { Accept: "application/json", "x-api-key": RACING_COM_API_KEY },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Racing.com returned ${response.status}.`);
  const body = await response.json();
  if (body?.errors?.length) throw new Error(body.errors[0]?.message || "Racing.com query failed.");
  return body?.data;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const track = String(searchParams.get("track") ?? "").trim().toLowerCase();
  const date = String(searchParams.get("date") ?? "").trim();
  const raceNo = Number.parseInt(String(searchParams.get("raceNo") ?? ""), 10);
  if (!/^[a-z0-9-]+$/.test(track) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || raceNo < 1) {
    return Response.json({ error: "Invalid Racing.com meeting or race." }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const meetingData = await queryRacingCom(
      `query GetMeetCode($venueName: String, $date: String) {
        GetMeetingByVenue(venueName: $venueName, date: $date) { id isJumpOut isTrial }
      }`,
      { venueName: track, date },
    );
    const meeting = meetingData?.GetMeetingByVenue?.find(
      (item: { isJumpOut?: boolean; isTrial?: boolean }) => !item.isJumpOut && !item.isTrial,
    );
    if (!meeting?.id) {
      return Response.json({ error: "Racing.com meeting not found." }, { status: 404, headers: CORS_HEADERS });
    }

    const racesData = await queryRacingCom(
      `query GetRaceResults($meetCode: ID!) {
        getRacesForMeet(meetCode: $meetCode) {
          raceNumber raceStatus
          formRaceEntries { raceEntryNumber horseName scratched finish finishAbv startingPrice margin }
        }
      }`,
      { meetCode: meeting.id },
    );
    const race = racesData?.getRacesForMeet?.find(
      (item: { raceNumber?: number }) => item.raceNumber === raceNo,
    );
    if (!race) {
      return Response.json({ error: "Racing.com race not found." }, { status: 404, headers: CORS_HEADERS });
    }
    return Response.json({ meetingId: meeting.id, race }, { headers: CORS_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 502, headers: CORS_HEADERS });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
