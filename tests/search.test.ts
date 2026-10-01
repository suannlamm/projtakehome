import { beforeEach, expect, it, vi } from "vitest";
import { asUser } from "./helpers";

const tmdb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tmdb", () => ({ tmdb }));
vi.mock("@/lib/queries", () => ({ getPosterInfo: async () => new Map() }));

import { searchRoutes } from "@/server/routes/search";

type Film = ReturnType<typeof film>;
type Person = { id: number; name: string; known_for_department: string; popularity: number };

const film = (id: number, title: string, popularity = 1, job?: string) => ({
  id,
  title,
  poster_path: null,
  release_date: "2015-01-01",
  overview: "",
  vote_average: 7,
  popularity,
  job,
});

// Stubs the three TMDB calls: film search, person search, and the person's credits.
function stubTmdb({ films = [], people = [], cast = [], crew = [] }: { films?: Film[]; people?: Person[]; cast?: Film[]; crew?: Film[] }) {
  tmdb.mockImplementation(async (path: string) =>
    path === "/search/movie" ? { results: films } : path === "/search/person" ? { results: people } : { cast, crew },
  );
}

const get = asUser(searchRoutes);
async function search(q: string) {
  const body = await (await get("GET", `/?q=${encodeURIComponent(q)}`)).json();
  return body.sections.map((s: { label: string; films: { title: string }[] }) => [s.label, s.films.map((f) => f.title)]);
}

beforeEach(() => tmdb.mockReset());

it("puts a director's own films first, most popular first", async () => {
  stubTmdb({
    films: [film(10, "Villeneuve Pironi")],
    people: [{ id: 1, name: "Denis Villeneuve", known_for_department: "Directing", popularity: 4 }],
    crew: [film(20, "Arrival", 50, "Director"), film(21, "Sicario", 80, "Director"), film(22, "A Documentary", 90, "Producer")],
  });
  expect(await search("villeneuve")).toEqual([
    ["Directed by Denis Villeneuve", ["Sicario", "Arrival"]],
    ["Films", ["Villeneuve Pironi"]],
  ]);
});

it("lists an actor's film once even if they're credited twice on it", async () => {
  stubTmdb({
    people: [{ id: 2, name: "Florence Pugh", known_for_department: "Acting", popularity: 11 }],
    cast: [film(30, "Oppenheimer", 90), film(30, "Oppenheimer", 90), film(31, "Midsommar", 50)],
  });
  expect(await search("florence pugh")).toEqual([["Starring Florence Pugh", ["Oppenheimer", "Midsommar"]]]);
});

it("skips the person when the query is a film's exact title", async () => {
  stubTmdb({
    films: [film(40, "Dune")],
    people: [{ id: 3, name: "Dune Lawrence", known_for_department: "Acting", popularity: 5 }],
  });
  expect(await search("Dune")).toEqual([["Films", ["Dune"]]]);
  expect(tmdb).not.toHaveBeenCalledWith(expect.stringMatching(/^\/person\//));
});

it("skips an obscure person whose name only happens to match", async () => {
  stubTmdb({
    films: [film(50, "Heat Wave")],
    people: [{ id: 4, name: "Anne Heat", known_for_department: "Acting", popularity: 0.3 }],
  });
  expect(await search("heat")).toEqual([["Films", ["Heat Wave"]]]);
});
