export type Neighborhood = {
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  airport: string;
  miles: number;
};

const NEIGHBORHOODS_URL =
  "https://media.callystoapp.com/rideshare/nyc_destinations/jfk_lga_ewr_neighborhoods_by_population_density_updated.csv?v=20261025";

let loading: Promise<Neighborhood[]> | null = null;

export function loadNeighborhoods() {
  loading ??= fetch(NEIGHBORHOODS_URL)
    .then(async (response) => {
      if (!response.ok) throw new Error("Couldn't load neighborhoods.");
      return placesFrom(await response.text());
    })
    .catch((cause: unknown) => {
      loading = null;
      throw cause;
    });
  return loading;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      cell = "";
      if (row.some((item) => item.length > 0)) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((columns) =>
    Object.fromEntries(header.map((key, column) => [key, columns[column] ?? ""])),
  );
}

function placesFrom(text: string) {
  const places: Neighborhood[] = [];
  for (const row of parseCsv(text)) {
    const city = row.neighborhood?.trim() ?? "";
    const state = row.state?.trim().toUpperCase() ?? "";
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    const miles = Number(row.distance_to_nearest_airport_miles);
    if (!city || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    places.push({
      city,
      state,
      latitude,
      longitude,
      airport: row.nearest_airport?.trim().toUpperCase() ?? "",
      miles: Number.isFinite(miles) ? miles : 0,
    });
  }
  return places;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const saved = previous[column];
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + cost);
      diagonal = saved;
    }
  }
  return previous[right.length];
}

function rank(query: string, city: string) {
  const wanted = normalize(query);
  const name = normalize(city);
  if (!wanted || !name) return null;
  if (name.startsWith(wanted)) return wanted.length === name.length ? 0 : 1;
  if (name.includes(wanted)) return 10 + name.indexOf(wanted);
  const limit = wanted.length <= 5 ? 2 : 3;
  const names = [name, ...name.split(" ")];
  let best = Number.POSITIVE_INFINITY;
  for (const candidate of names) {
    const distance = levenshtein(wanted, candidate);
    if (distance < best) best = distance;
  }
  if (best > limit) return null;
  return 100 + best;
}

export function suggestNeighborhoods(places: Neighborhood[], query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  return places
    .map((place) => ({ place, score: rank(trimmed, place.city) }))
    .filter((item): item is { place: Neighborhood; score: number } => item.score !== null)
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.place.city.localeCompare(right.place.city) ||
        left.place.state.localeCompare(right.place.state),
    )
    .slice(0, 8)
    .map((item) => item.place);
}
