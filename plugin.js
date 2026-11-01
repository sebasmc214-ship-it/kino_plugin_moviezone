// MovieZone - Plugin de Kino para LaMovie (Películas, series, novelas, anime, colecciones y sagas)
// Ejecutado en QuickJS. Sin require, process, Buffer, setTimeout ni fetch nativo.

const BASE_API = "https://lamovie.org/wp-api/v1";
const UPLOADS_BASE = "https://lamovie.org/wp-content/uploads";
const BRAND_BANNER = "https://raw.githubusercontent.com/sebasmc214-ship-it/kino_plugin_moviezone/main/banner.jpg";

// Categorías temáticas destacadas con su term_id de LaMovie
const FEATURED_GENRES = [
  { id: 32, name: "Acción", slug: "accion", genreTag: "accion" },
  { id: 18, name: "Comedia", slug: "comedia", genreTag: "comedia" },
  { id: 17, name: "Drama", slug: "drama", genreTag: "drama" },
  { id: 33, name: "Suspenso", slug: "suspense", genreTag: "suspenso" },
  { id: 96, name: "Terror", slug: "terror", genreTag: "terror" },
  { id: 520, name: "Animación", slug: "animacion", genreTag: "animacion" },
  { id: 131, name: "Ciencia ficción", slug: "ciencia-ficcion", genreTag: "ciencia-ficcion" },
  { id: 130, name: "Aventura", slug: "aventura", genreTag: "aventura" },
  { id: 115, name: "Romance", slug: "romance", genreTag: "romance" },
  { id: 180, name: "Crimen", slug: "crimen", genreTag: "crimen" },
  { id: 398, name: "Familia", slug: "familia", genreTag: "infantil" },
  { id: 229, name: "Fantasía", slug: "fantasia", genreTag: "fantasia" }
];

const GENRE_MAP = {
  17: "drama",
  18: "comedia",
  33: "suspenso",
  32: "accion",
  520: "animacion",
  96: "terror",
  180: "crimen",
  130: "aventura",
  115: "romance",
  398: "familia",
  97: "misterio",
  131: "ciencia-ficcion",
  229: "fantasia",
  704: "ciencia-ficcion",
  705: "accion",
  164: "documentales",
  165: "historia",
  8: "musica",
  3056: "belica",
  674: "western",
  703: "infantil"
};

/**
 * Convierte un post de la API de LaMovie a un Item del contrato de Kino.
 */
function toItem(post) {
  if (!post || typeof post !== "object") return null;

  const postType = post.type || "";
  const isSeries = postType === "tvshows" || postType === "animes" || postType === "novels" || postType === "wwe";
  const isCollection = postType === "collections";

  const kind = (isSeries || isCollection) ? "series" : "movie";
  const id = `${postType || kind}-${post._id}`;
  const ref = isCollection ? `collection:${post._id}` : `${postType || (isSeries ? "tvshows" : "movies")}:${post._id}`;

  let year;
  if (post.release_date && typeof post.release_date === "string") {
    const y = parseInt(post.release_date.slice(0, 4), 10);
    if (!isNaN(y) && y > 1900 && y < 2100) year = y;
  }
  if (!year && post.title) {
    const ym = post.title.match(/\((\d{4})\)/);
    if (ym) year = parseInt(ym[1], 10);
  }

  let poster;
  let backdrop;

  if (Array.isArray(post.images) && post.images.length > 0) {
    const firstImg = post.images[0];
    if (firstImg && typeof firstImg === "object") {
      if (firstImg.poster) {
        poster = firstImg.poster.startsWith("http") ? firstImg.poster : `${UPLOADS_BASE}${firstImg.poster}`;
      }
      if (firstImg.backdrop) {
        backdrop = firstImg.backdrop.startsWith("http") ? firstImg.backdrop : `${UPLOADS_BASE}${firstImg.backdrop}`;
      }
    }
  } else if (post.images && typeof post.images === "object") {
    if (post.images.poster) {
      poster = post.images.poster.startsWith("http")
        ? post.images.poster
        : `${UPLOADS_BASE}${post.images.poster}`;
    }
    if (post.images.backdrop) {
      backdrop = post.images.backdrop.startsWith("http")
        ? post.images.backdrop
        : `${UPLOADS_BASE}${post.images.backdrop}`;
    }
  }

  // Fallback si no hay poster directo pero hay galerías (ej. en colecciones)
  if (!poster && Array.isArray(post.galleries) && post.galleries.length > 0) {
    const firstGallery = post.galleries[0];
    if (typeof firstGallery === "string") {
      const matchPath = firstGallery.trim().split("\n")[0];
      if (matchPath) {
        poster = matchPath.startsWith("http") ? matchPath : `https://image.tmdb.org/t/p/w500${matchPath.trim()}`;
      }
    }
  }

  let rating;
  if (post.rating) {
    const r = parseFloat(post.rating);
    if (!isNaN(r) && r >= 0 && r <= 10) rating = r;
  } else if (post.community_rating) {
    const cr = parseFloat(post.community_rating);
    if (!isNaN(cr) && cr > 0 && cr <= 10) rating = cr;
  }

  const genres = [];
  if (Array.isArray(post.genres)) {
    for (const gId of post.genres) {
      const slug = GENRE_MAP[gId];
      if (slug && !genres.includes(slug)) genres.push(slug);
      if (genres.length >= 5) break;
    }
  }

  const badges = [];
  if (isCollection) {
    badges.push("Saga / Colección");
  } else if (postType === "novels") {
    badges.push("Novela");
  } else if (postType === "wwe") {
    badges.push("WWE");
  }

  return {
    id,
    ref,
    title: (post.title || "Sin título").replace(/\s*\(\d{4}\)\s*$/, "").trim(),
    kind,
    year,
    poster,
    backdrop,
    overview: post.overview || undefined,
    rating,
    genres: genres.length > 0 ? genres : undefined,
    badges: badges.length > 0 ? badges : undefined
  };
}

/**
 * Convierte un actor/cast a un item de Kino tipo serie para que Kino muestre sus películas como capítulos.
 */
function toActorItem(actor) {
  if (!actor || !actor.term_id) return null;

  let image;
  if (actor.meta && actor.meta.profile_path) {
    image = actor.meta.profile_path.startsWith("http")
      ? actor.meta.profile_path
      : `https://image.tmdb.org/t/p/w500${actor.meta.profile_path}`;
  } else if (actor.meta && actor.meta.image) {
    image = actor.meta.image.startsWith("http")
      ? actor.meta.image
      : `https://image.tmdb.org/t/p/w500${actor.meta.image}`;
  }

  return {
    id: `actor-${actor.term_id}`,
    ref: `actor:${actor.term_id}`,
    title: actor.term_name || "Actor",
    kind: "series", // 'series' para que Kino muestre la lista de títulos de su filmografía
    poster: image,
    overview: actor.term_description || undefined,
    badges: ["Actor"]
  };
}

/**
 * Convierte una entrada de anime de Kitsu a un Item de Kino.
 */
function toKitsuItem(kitsuAnime) {
  if (!kitsuAnime || !kitsuAnime.id) return null;
  const attr = kitsuAnime.attributes || {};
  const titles = attr.titles || {};
  const mainTitle = titles.en || titles.en_jp || attr.canonicalTitle || "Anime";
  let poster = attr.posterImage?.small || attr.posterImage?.original;
  let backdrop = attr.coverImage?.small || attr.coverImage?.original;
  let year;
  if (attr.startDate && typeof attr.startDate === "string") {
    const y = parseInt(attr.startDate.slice(0, 4), 10);
    if (!isNaN(y) && y > 1960) year = y;
  }
  let rating;
  if (attr.averageRating) {
    const r = parseFloat(attr.averageRating) / 10;
    if (!isNaN(r) && r > 0) rating = parseFloat(r.toFixed(1));
  }

  return {
    id: `kitsu-${kitsuAnime.id}`,
    ref: `kitsu:${kitsuAnime.id}`,
    title: mainTitle,
    kind: "series",
    year,
    poster,
    backdrop,
    overview: attr.synopsis || undefined,
    rating,
    genres: ["anime"],
    badges: ["Anime"]
  };
}

/**
 * Busca títulos en LaMovie y en las diferentes secciones o actores.
 * Soporta capability 'scopedSearch' para filtrar dentro de pestañas específicas (ej. dentro de Actores o Colecciones).
 */
export async function search(query) {
  await null;

  if (!query || !query.q || !query.q.trim()) return [];

  const rawTerm = query.q.trim();
  const q = encodeURIComponent(rawTerm);

  // Si la búsqueda es dentro de una categoría o contexto específico (scopedSearch)
  if (query.within) {
    if (query.within.startsWith("cast:")) {
      const aUrl = `${BASE_API}/listing/tax/cast?page=1&orderBy=latest&order=desc&postsPerPage=50`;
      const aRes = await kino.fetch(aUrl).catch(() => null);
      if (aRes && aRes.ok) {
        const aData = aRes.json();
        const actorItems = aData && aData.data && Array.isArray(aData.data.items) ? aData.data.items : [];
        return actorItems
          .filter(a => a.term_name && a.term_name.toLowerCase().includes(rawTerm.toLowerCase()))
          .map(toActorItem)
          .filter(Boolean);
      }
      return [];
    }

    if (query.within.startsWith("collections")) {
      const cUrl = `${BASE_API}/search?q=${q}&postType=collections&postsPerPage=30`;
      const cRes = await kino.fetch(cUrl).catch(() => null);
      if (cRes && cRes.ok) {
        const cData = cRes.json();
        const posts = cData && cData.data && Array.isArray(cData.data.posts) ? cData.data.posts : [];
        return posts.map(toItem).filter(Boolean);
      }
      return [];
    }

    if (query.within.startsWith("animes")) {
      const anUrl = `${BASE_API}/search?q=${q}&postType=animes&postsPerPage=30`;
      const kitsuSearchUrl = `https://kitsu.io/api/edge/anime?filter[text]=${q}&page[limit]=15`;
      const [anRes, kitsuRes] = await Promise.all([
        kino.fetch(anUrl).catch(() => null),
        kino.fetch(kitsuSearchUrl).catch(() => null)
      ]);
      const resItems = [];
      if (anRes && anRes.ok) {
        const anData = anRes.json();
        const posts = anData && anData.data && Array.isArray(anData.data.posts) ? anData.data.posts : [];
        resItems.push(...posts.map(toItem).filter(Boolean));
      }
      if (kitsuRes && kitsuRes.ok) {
        const kd = kitsuRes.json();
        const kitsuAnimes = kd && Array.isArray(kd.data) ? kd.data : [];
        resItems.push(...kitsuAnimes.map(toKitsuItem).filter(Boolean));
      }
      return resItems;
    }

    if (query.within.startsWith("tvshows") || query.within.startsWith("novels")) {
      const tvUrl = `${BASE_API}/search?q=${q}&postType=tvshows&postsPerPage=30`;
      const novUrl = `${BASE_API}/search?q=${q}&postType=novels&postsPerPage=30`;
      const [tvRes, novRes] = await Promise.all([
        kino.fetch(tvUrl).catch(() => null),
        kino.fetch(novUrl).catch(() => null)
      ]);
      const resPosts = [];
      if (tvRes && tvRes.ok) {
        const d = tvRes.json();
        if (d && d.data && Array.isArray(d.data.posts)) resPosts.push(...d.data.posts);
      }
      if (novRes && novRes.ok) {
        const d = novRes.json();
        if (d && d.data && Array.isArray(d.data.posts)) resPosts.push(...d.data.posts);
      }
      return resPosts.map(toItem).filter(Boolean);
    }

    if (query.within.startsWith("genre:")) {
      const gId = parseInt(query.within.split(":")[1], 10);
      if (gId) {
        const fParam = encodeURIComponent(JSON.stringify({ genres: [gId] }));
        const gUrl = `${BASE_API}/listing/movies?page=1&orderBy=ID&order=desc&postType=movies&postsPerPage=40&filter=${fParam}`;
        const gRes = await kino.fetch(gUrl).catch(() => null);
        if (gRes && gRes.ok) {
          const gData = gRes.json();
          const posts = gData && gData.data && Array.isArray(gData.data.posts) ? gData.data.posts : [];
          return posts
            .filter(p => p.title && p.title.toLowerCase().includes(rawTerm.toLowerCase()))
            .map(toItem)
            .filter(Boolean);
        }
      }
      return [];
    }
  }

  const [searchRes, actorsRes] = await Promise.all([
    kino.fetch(`${BASE_API}/search?q=${q}&postType=any&postsPerPage=40`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/tax/cast?page=1&orderBy=latest&order=desc&postsPerPage=20`).catch(() => null)
  ]);

  const items = [];

  if (searchRes && searchRes.ok) {
    const res = searchRes.json();
    const rawPosts = res && res.data && Array.isArray(res.data.posts) ? res.data.posts : [];
    items.push(...rawPosts.map(toItem).filter(Boolean));
  }

  // Si coincide con actores destacados
  if (actorsRes && actorsRes.ok) {
    const aData = actorsRes.json();
    const actorItems = aData && aData.data && Array.isArray(aData.data.items) ? aData.data.items : [];
    const matchedActors = actorItems.filter(a =>
      a.term_name && a.term_name.toLowerCase().includes(rawTerm.toLowerCase())
    );
    for (const ma of matchedActors) {
      const actItem = toActorItem(ma);
      if (actItem) items.unshift(actItem);
    }
  }

  if (query.type === "movie" || query.type === "series") {
    return [
      ...items.filter(x => x.kind === query.type),
      ...items.filter(x => x.kind !== query.type)
    ];
  }

  return items;
}

/**
 * Filas de la pantalla de Inicio de Kino.
 */
export async function home() {
  await null;

  const genreFetches = FEATURED_GENRES.map(g => {
    const f = encodeURIComponent(JSON.stringify({ genres: [g.id] }));
    return kino.fetch(`${BASE_API}/listing/movies?page=1&orderBy=ID&order=desc&postType=movies&postsPerPage=20&filter=${f}`).catch(() => null);
  });

  const [
    upcomingRes,
    popularMoviesRes,
    latestMoviesRes,
    seriesRes,
    novelsRes,
    animesRes,
    collectionsRes,
    actorsRes,
    ...genreResponses
  ] = await Promise.all([
    kino.fetch(`${BASE_API}/listing/movies?page=1&orderBy=ID&order=desc&postType=movies&postsPerPage=35&filter=${encodeURIComponent(JSON.stringify({ years: [74006, 4] }))}`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/movies?page=1&orderBy=views&order=desc&postType=movies&postsPerPage=20`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/movies?page=1&orderBy=ID&order=desc&postType=movies&postsPerPage=35`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/tvshows?page=1&orderBy=ID&order=desc&postType=tvshows&postsPerPage=20`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/novels?page=1&orderBy=ID&order=desc&postType=novels&postsPerPage=20`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/animes?page=1&orderBy=ID&order=desc&postType=animes&postsPerPage=20`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/collections?page=1&orderBy=ID&order=desc&postType=collections&postsPerPage=20`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/tax/cast?page=1&orderBy=latest&order=desc&postsPerPage=20`).catch(() => null),
    ...genreFetches
  ]);

  const rows = [];

  // 1. Estrenos destacados (películas estrenadas recientemente en 2026/2025)
  const premierItemsMap = new Map();
  if (upcomingRes && upcomingRes.ok) {
    const data = upcomingRes.json();
    const posts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
    for (const post of posts) {
      const item = toItem(post);
      if (item && !premierItemsMap.has(item.id)) premierItemsMap.set(item.id, item);
    }
  }
  const premierItems = Array.from(premierItemsMap.values());
  if (premierItems.length > 0) {
    // Garantizar que la portada del plugin en 'Tus plugins' sea siempre el banner oficial de MovieZone
    premierItems[0].backdrop = BRAND_BANNER;

    rows.push({
      id: "estrenos",
      title: "Estrenos destacados",
      ref: "movies:upcoming",
      genre: "peliculas",
      items: premierItems
    });
  }

  // 2. Películas (renombrado según solicitud)
  if (popularMoviesRes && popularMoviesRes.ok) {
    const data = popularMoviesRes.json();
    const posts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
    const items = posts.map(toItem).filter(Boolean);
    if (items.length > 0) {
      rows.push({
        id: "peliculas-populares",
        title: "Películas",
        ref: "movies:popular",
        genre: "peliculas",
        items
      });
    }
  }

  // 3. Películas recién agregadas
  if (latestMoviesRes && latestMoviesRes.ok) {
    const data = latestMoviesRes.json();
    const posts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
    const items = posts.map(toItem).filter(Boolean);
    if (items.length > 0) {
      rows.push({
        id: "peliculas-recientes",
        title: "Películas recién agregadas",
        ref: "movies:latest",
        genre: "peliculas",
        items
      });
    }
  }

  // 4. Series (renombrado según solicitud)
  if (seriesRes && seriesRes.ok) {
    const data = seriesRes.json();
    const posts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
    const items = posts.map(toItem).filter(Boolean);
    if (items.length > 0) {
      rows.push({
        id: "series-recientes",
        title: "Series",
        ref: "tvshows:latest",
        genre: "series",
        items
      });
    }
  }

  // 5. Novelas
  if (novelsRes && novelsRes.ok) {
    const data = novelsRes.json();
    const posts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
    const items = posts.map(toItem).filter(Boolean);
    if (items.length > 0) {
      rows.push({
        id: "telenovelas",
        title: "Telenovelas",
        ref: "novels:latest",
        genre: "series",
        items
      });
    }
  }

  // 6. Anime en español
  if (animesRes && animesRes.ok) {
    const data = animesRes.json();
    const posts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
    const items = posts.map(toItem).filter(Boolean);
    if (items.length > 0) {
      rows.push({
        id: "anime-reciente",
        title: "Anime en español",
        ref: "animes:latest",
        genre: "anime",
        items
      });
    }
  }

  // 7. Sagas y Colecciones
  if (collectionsRes && collectionsRes.ok) {
    const data = collectionsRes.json();
    const posts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
    const items = posts.map(toItem).filter(Boolean);
    if (items.length > 0) {
      rows.push({
        id: "colecciones",
        title: "Sagas y Colecciones",
        ref: "collections:latest",
        genre: "entretenimiento",
        items
      });
    }
  }

  // 8. Actores y Actrices
  if (actorsRes && actorsRes.ok) {
    const data = actorsRes.json();
    const actorItems = data && data.data && Array.isArray(data.data.items) ? data.data.items : [];
    const items = actorItems.map(toActorItem).filter(Boolean);
    if (items.length > 0) {
      rows.push({
        id: "actores-destacados",
        title: "Actores y Actrices",
        ref: "cast:latest",
        genre: "otros",
        items
      });
    }
  }

  // 9. Categorías temáticas (Acción, Comedia, Drama, Suspenso, Terror, Animación, etc.)
  for (let i = 0; i < FEATURED_GENRES.length; i++) {
    const genreInfo = FEATURED_GENRES[i];
    const res = genreResponses[i];
    if (res && res.ok) {
      const data = res.json();
      const posts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
      const items = posts.map(toItem).filter(Boolean);
      if (items.length > 0) {
        rows.push({
          id: `categoria-${genreInfo.slug}`,
          title: genreInfo.name,
          ref: `genre:${genreInfo.id}`,
          genre: genreInfo.genreTag || "peliculas",
          items
        });
      }
    }
  }

  return rows;
}

/**
 * Sección dedicada de MovieZone para la barra lateral y "Secciones de los plugins".
 * Organizada con pestañas: Todo, Películas, Series, Anime, Colecciones y Actores.
 */
export async function section({ tab } = {}) {
  await null;

  const tabs = [
    { id: "todo", label: "Catálogo completo" },
    { id: "peliculas", label: "Películas" },
    { id: "series", label: "Series y Novelas" },
    { id: "anime", label: "Anime" },
    { id: "colecciones", label: "Sagas y Colecciones" },
    { id: "actores", label: "Actores" }
  ];

  const chosen = tabs.some(t => t.id === tab) ? tab : "todo";

  if (chosen === "todo") {
    const homeRows = await home();
    return {
      tabs,
      tab: chosen,
      hero: {
        title: "MovieZone",
        text: "Películas de estreno, series completas, novelas, anime y sagas en español."
      },
      rows: homeRows
    };
  }

  if (chosen === "peliculas") {
    const genreFetches = FEATURED_GENRES.map(g => {
      const f = encodeURIComponent(JSON.stringify({ genres: [g.id] }));
      return kino.fetch(`${BASE_API}/listing/movies?page=1&orderBy=ID&order=desc&postType=movies&postsPerPage=20&filter=${f}`).catch(() => null);
    });

    const [upcomingRes, popularRes, latestRes, ...genreResList] = await Promise.all([
      kino.fetch(`${BASE_API}/listing/movies?page=1&orderBy=ID&order=desc&postType=movies&postsPerPage=35&filter=${encodeURIComponent(JSON.stringify({ years: [74006, 4] }))}`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/movies?page=1&orderBy=views&order=desc&postType=movies&postsPerPage=20`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/movies?page=1&orderBy=ID&order=desc&postType=movies&postsPerPage=35`).catch(() => null),
      ...genreFetches
    ]);

    const pRows = [];

    if (upcomingRes && upcomingRes.ok) {
      const d = upcomingRes.json();
      const p = d && d.data && Array.isArray(d.data.posts) ? d.data.posts : [];
      const it = p.map(toItem).filter(Boolean);
      if (it.length > 0) pRows.push({ id: "sec-estrenos", title: "Estrenos 2025/2026", ref: "movies:upcoming", genre: "peliculas", items: it });
    }
    if (popularRes && popularRes.ok) {
      const d = popularRes.json();
      const p = d && d.data && Array.isArray(d.data.posts) ? d.data.posts : [];
      const it = p.map(toItem).filter(Boolean);
      if (it.length > 0) pRows.push({ id: "sec-populares", title: "Películas más vistas", ref: "movies:popular", genre: "peliculas", items: it });
    }
    if (latestRes && latestRes.ok) {
      const d = latestRes.json();
      const p = d && d.data && Array.isArray(d.data.posts) ? d.data.posts : [];
      const it = p.map(toItem).filter(Boolean);
      if (it.length > 0) pRows.push({ id: "sec-recientes", title: "Películas recién agregadas", ref: "movies:latest", genre: "peliculas", items: it });
    }

    for (let i = 0; i < FEATURED_GENRES.length; i++) {
      const g = FEATURED_GENRES[i];
      const r = genreResList[i];
      if (r && r.ok) {
        const d = r.json();
        const p = d && d.data && Array.isArray(d.data.posts) ? d.data.posts : [];
        const it = p.map(toItem).filter(Boolean);
        if (it.length > 0) pRows.push({ id: `sec-cat-${g.slug}`, title: g.name, ref: `genre:${g.id}`, genre: g.genreTag || "peliculas", items: it });
      }
    }

    return {
      tabs,
      tab: chosen,
      hero: {
        title: "Películas en MovieZone",
        text: "Explora los últimos estrenos y las mejores categorías de cine."
      },
      rows: pRows
    };
  }

  if (chosen === "series") {
    const [sNewRes, sPopRes, nNewRes, nPopRes] = await Promise.all([
      kino.fetch(`${BASE_API}/listing/tvshows?page=1&orderBy=ID&order=desc&postType=tvshows&postsPerPage=25`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/tvshows?page=1&orderBy=views&order=desc&postType=tvshows&postsPerPage=25`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/novels?page=1&orderBy=ID&order=desc&postType=novels&postsPerPage=25`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/novels?page=1&orderBy=views&order=desc&postType=novels&postsPerPage=25`).catch(() => null)
    ]);
    const sRows = [];
    if (sPopRes && sPopRes.ok) {
      const d = sPopRes.json();
      const p = d && d.data && Array.isArray(d.data.posts) ? d.data.posts : [];
      const it = p.map(toItem).filter(Boolean);
      if (it.length > 0) sRows.push({ id: "sec-series-pop", title: "Series más populares", ref: "tvshows:popular", genre: "series", items: it });
    }
    if (sNewRes && sNewRes.ok) {
      const d = sNewRes.json();
      const p = d && d.data && Array.isArray(d.data.posts) ? d.data.posts : [];
      const it = p.map(toItem).filter(Boolean);
      if (it.length > 0) sRows.push({ id: "sec-series-new", title: "Series recién agregadas", ref: "tvshows:latest", genre: "series", items: it });
    }
    if (nPopRes && nPopRes.ok) {
      const d = nPopRes.json();
      const p = d && d.data && Array.isArray(d.data.posts) ? d.data.posts : [];
      const it = p.map(toItem).filter(Boolean);
      if (it.length > 0) sRows.push({ id: "sec-novelas-pop", title: "Telenovelas más vistas", ref: "novels:popular", genre: "series", items: it });
    }
    if (nNewRes && nNewRes.ok) {
      const d = nNewRes.json();
      const p = d && d.data && Array.isArray(d.data.posts) ? d.data.posts : [];
      const it = p.map(toItem).filter(Boolean);
      if (it.length > 0) sRows.push({ id: "sec-novelas-new", title: "Telenovelas recientes", ref: "novels:latest", genre: "series", items: it });
    }
    return {
      tabs,
      tab: chosen,
      hero: {
        title: "Series y Telenovelas",
        text: "Temporadas completas en español."
      },
      rows: sRows
    };
  }

  if (chosen === "anime") {
    const [aNewRes, aPopRes, aP2Res, kitsuTrendRes] = await Promise.all([
      kino.fetch(`${BASE_API}/listing/animes?page=1&orderBy=ID&order=desc&postType=animes&postsPerPage=25`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/animes?page=1&orderBy=views&order=desc&postType=animes&postsPerPage=25`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/animes?page=2&orderBy=ID&order=desc&postType=animes&postsPerPage=25`).catch(() => null),
      kino.fetch("https://kitsu.io/api/edge/trending/anime").catch(() => null)
    ]);
    const aRows = [];
    if (kitsuTrendRes && kitsuTrendRes.ok) {
      const kd = kitsuTrendRes.json();
      const ka = kd && Array.isArray(kd.data) ? kd.data : [];
      const kitItems = ka.map(toKitsuItem).filter(Boolean);
      if (kitItems.length > 0) aRows.push({ id: "sec-animes-trend", title: "Anime en tendencia mundial", ref: "kitsu:trending", genre: "anime", items: kitItems });
    }
    if (aPopRes && aPopRes.ok) {
      const d = aPopRes.json();
      const p = d && d.data && Array.isArray(d.data.posts) ? d.data.posts : [];
      const it = p.map(toItem).filter(Boolean);
      if (it.length > 0) aRows.push({ id: "sec-animes-pop", title: "Anime más popular", ref: "animes:popular", genre: "anime", items: it });
    }
    if (aNewRes && aNewRes.ok) {
      const d = aNewRes.json();
      const p = d && d.data && Array.isArray(d.data.posts) ? d.data.posts : [];
      const it = p.map(toItem).filter(Boolean);
      if (it.length > 0) aRows.push({ id: "sec-animes-new", title: "Anime recién agregado", ref: "animes:latest", genre: "anime", items: it });
    }
    if (aP2Res && aP2Res.ok) {
      const d = aP2Res.json();
      const p = d && d.data && Array.isArray(d.data.posts) ? d.data.posts : [];
      const it = p.map(toItem).filter(Boolean);
      if (it.length > 0) aRows.push({ id: "sec-animes-mas", title: "Más títulos de Anime", ref: "animes:page2", genre: "anime", items: it });
    }
    return {
      tabs,
      tab: chosen,
      hero: {
        title: "Anime en español",
        text: "Disfruta tus animes favoritos con audio y subtítulos en español."
      },
      rows: aRows
    };
  }

  if (chosen === "colecciones") {
    const [col1Res, col2Res, col3Res, col4Res] = await Promise.all([
      kino.fetch(`${BASE_API}/listing/collections?page=1&orderBy=ID&order=desc&postType=collections&postsPerPage=25`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/collections?page=2&orderBy=ID&order=desc&postType=collections&postsPerPage=25`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/collections?page=3&orderBy=ID&order=desc&postType=collections&postsPerPage=25`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/collections?page=4&orderBy=ID&order=desc&postType=collections&postsPerPage=25`).catch(() => null)
    ]);
    const cRows = [];
    if (col1Res && col1Res.ok) {
      const d = col1Res.json();
      const p = d && d.data && Array.isArray(d.data.posts) ? d.data.posts : [];
      const it = p.map(toItem).filter(Boolean);
      if (it.length > 0) cRows.push({ id: "sec-col-1", title: "Sagas y Colecciones destacadas", ref: "collections:latest", genre: "entretenimiento", items: it });
    }
    if (col2Res && col2Res.ok) {
      const d = col2Res.json();
      const p = d && d.data && Array.isArray(d.data.posts) ? d.data.posts : [];
      const it = p.map(toItem).filter(Boolean);
      if (it.length > 0) cRows.push({ id: "sec-col-2", title: "Sagas populares", ref: "collections:p2", genre: "entretenimiento", items: it });
    }
    if (col3Res && col3Res.ok) {
      const d = col3Res.json();
      const p = d && d.data && Array.isArray(d.data.posts) ? d.data.posts : [];
      const it = p.map(toItem).filter(Boolean);
      if (it.length > 0) cRows.push({ id: "sec-col-3", title: "Colecciones de franquicias", ref: "collections:p3", genre: "entretenimiento", items: it });
    }
    if (col4Res && col4Res.ok) {
      const d = col4Res.json();
      const p = d && d.data && Array.isArray(d.data.posts) ? d.data.posts : [];
      const it = p.map(toItem).filter(Boolean);
      if (it.length > 0) cRows.push({ id: "sec-col-4", title: "Más Sagas y Universos", ref: "collections:p4", genre: "entretenimiento", items: it });
    }
    return {
      tabs,
      tab: chosen,
      hero: {
        title: "Sagas y Colecciones",
        text: "Colecciones de películas y sagas ordenadas cronológicamente."
      },
      rows: cRows
    };
  }

  if (chosen === "actores") {
    const [act1Res, act2Res, act3Res, act4Res] = await Promise.all([
      kino.fetch(`${BASE_API}/listing/tax/cast?page=1&orderBy=latest&order=desc&postsPerPage=20`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/tax/cast?page=2&orderBy=latest&order=desc&postsPerPage=20`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/tax/cast?page=3&orderBy=latest&order=desc&postsPerPage=20`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/tax/cast?page=4&orderBy=latest&order=desc&postsPerPage=20`).catch(() => null)
    ]);
    const actRows = [];
    if (act1Res && act1Res.ok) {
      const d = act1Res.json();
      const p = d && d.data && Array.isArray(d.data.items) ? d.data.items : [];
      const it = p.map(toActorItem).filter(Boolean);
      if (it.length > 0) actRows.push({ id: "sec-actores-1", title: "Actores y Actrices destacados", ref: "cast:latest", genre: "otros", items: it });
    }
    if (act2Res && act2Res.ok) {
      const d = act2Res.json();
      const p = d && d.data && Array.isArray(d.data.items) ? d.data.items : [];
      const it = p.map(toActorItem).filter(Boolean);
      if (it.length > 0) actRows.push({ id: "sec-actores-2", title: "Estrellas de Hollywood", ref: "cast:p2", genre: "otros", items: it });
    }
    if (act3Res && act3Res.ok) {
      const d = act3Res.json();
      const p = d && d.data && Array.isArray(d.data.items) ? d.data.items : [];
      const it = p.map(toActorItem).filter(Boolean);
      if (it.length > 0) actRows.push({ id: "sec-actores-3", title: "Iconos del cine de acción", ref: "cast:p3", genre: "otros", items: it });
    }
    if (act4Res && act4Res.ok) {
      const d = act4Res.json();
      const p = d && d.data && Array.isArray(d.data.items) ? d.data.items : [];
      const it = p.map(toActorItem).filter(Boolean);
      if (it.length > 0) actRows.push({ id: "sec-actores-4", title: "Más Actores y Actrices", ref: "cast:p4", genre: "otros", items: it });
    }
    return {
      tabs,
      tab: chosen,
      hero: {
        title: "Actores y Actrices",
        text: "Explora la filmografía de tus estrellas favoritas."
      },
      rows: actRows
    };
  }

  return { tabs, tab: chosen, rows: [] };
}

/**
 * Categorías oficiales exportadas para la pantalla 'Categorías' de Kino TV.
 * Permite que MovieZone aparezca en los mosaicos de categorías con arte visual.
 */
export async function categories() {
  await null;

  return FEATURED_GENRES.map(g => {
    let art;
    if (g.slug === "accion" || g.slug === "crimen") art = `${UPLOADS_BASE}/thumbs/8a2d334536b2f4146af8cf46acd85110_hd.webp`;
    else if (g.slug === "comedia") art = `${UPLOADS_BASE}/thumbs/f3be5eb7ff15f2013a3b65fbca4bf864_hd.webp`;
    else if (g.slug === "drama" || g.slug === "romance" || g.slug === "familia") art = `${UPLOADS_BASE}/thumbs/b912bf47e2c28af9cc19658d3cd935d3_hd.webp`;
    else if (g.slug === "suspense") art = `${UPLOADS_BASE}/thumbs/92dd74653c602bae9e466999b7ac15a0_hd.webp`;
    else if (g.slug === "terror") art = `${UPLOADS_BASE}/thumbs/63a7fa2a092fb74558974240e53d7c9a_hd.webp`;
    else if (g.slug === "animacion") art = `${UPLOADS_BASE}/thumbs/2b348ef45c33b63733388ee1f906b8a2_hd.webp`;
    else if (g.slug === "ciencia-ficcion") art = `${UPLOADS_BASE}/thumbs/8275fb6c3c5132ef0289546b993b52ab_hd.webp`;
    else if (g.slug === "aventura") art = `${UPLOADS_BASE}/thumbs/f66000cec7fe1a765db56272c4e1e9d5_hd.webp`;
    else if (g.slug === "fantasia") art = `${UPLOADS_BASE}/thumbs/ba5451d3c91a0f982f103cdbe249bc78_hd.webp`;
    else art = BRAND_BANNER;

    return {
      id: `cat-${g.slug}`,
      title: g.name,
      ref: `genre:${g.id}`,
      art
    };
  });
}

/**
 * Paginación de "Ver más" para cada sección del catálogo.
 */
export async function browse(ref, cursor) {
  await null;

  const page = cursor ? parseInt(cursor, 10) || 1 : 1;

  // 1. Explorar películas de un Actor específico
  if (ref.startsWith("actor:")) {
    const actorId = parseInt(ref.split(":")[1], 10);
    if (!actorId) throw kino.error("not_found", "Actor no encontrado");
    const filterParam = encodeURIComponent(JSON.stringify({ cast: [actorId] }));
    const url = `${BASE_API}/listing/movies?page=${page}&orderBy=ID&order=desc&postType=movies&postsPerPage=20&filter=${filterParam}`;
    const r = await kino.fetch(url);
    if (!r.ok) throw kino.error("unavailable", `Error al cargar filmografía (${r.status})`);
    const data = r.json();
    const rawPosts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
    const items = rawPosts.map(toItem).filter(Boolean);
    const pagination = data && data.data && data.data.pagination;
    return {
      items,
      next: pagination && pagination.next_page_url ? String(page + 1) : undefined
    };
  }

  // 2. Explorar lista de Actores
  if (ref.startsWith("cast:")) {
    const castPage = ref === "cast:latest" ? page : (parseInt(ref.replace("cast:p", ""), 10) || page);
    const effectivePage = cursor ? page : castPage;
    const url = `${BASE_API}/listing/tax/cast?page=${effectivePage}&orderBy=latest&order=desc&postsPerPage=20`;
    const r = await kino.fetch(url);
    if (!r.ok) throw kino.error("unavailable", `Error al cargar actores (${r.status})`);
    const data = r.json();
    const rawItems = data && data.data && Array.isArray(data.data.items) ? data.data.items : [];
    const items = rawItems.map(toActorItem).filter(Boolean);
    const pagination = data && data.data && data.data.pagination;
    return {
      items,
      next: pagination && pagination.next_page_url ? String(effectivePage + 1) : undefined
    };
  }

  // 3. Explorar Anime en tendencia (Kitsu)
  if (ref === "kitsu:trending") {
    const offset = (page - 1) * 20;
    const url = `https://kitsu.io/api/edge/anime?page[limit]=20&page[offset]=${offset}&sort=-userCount`;
    const r = await kino.fetch(url);
    if (!r.ok) throw kino.error("unavailable", `Error al cargar anime (${r.status})`);
    const data = r.json();
    const rawAnimes = data && Array.isArray(data.data) ? data.data : [];
    const items = rawAnimes.map(toKitsuItem).filter(Boolean);
    const hasNext = data && data.links && data.links.next;
    return {
      items,
      next: hasNext ? String(page + 1) : undefined
    };
  }

  // 4. Explorar películas de una Categoría / Género específico
  if (ref.startsWith("genre:")) {
    const genreId = parseInt(ref.split(":")[1], 10);
    if (!genreId) throw kino.error("not_found", "Categoría no encontrada");
    const filterParam = encodeURIComponent(JSON.stringify({ genres: [genreId] }));
    const url = `${BASE_API}/listing/movies?page=${page}&orderBy=ID&order=desc&postType=movies&postsPerPage=20&filter=${filterParam}`;
    const r = await kino.fetch(url);
    if (!r.ok) throw kino.error("unavailable", `Error al cargar categoría (${r.status})`);
    const data = r.json();
    const rawPosts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
    const items = rawPosts.map(toItem).filter(Boolean);
    const pagination = data && data.data && data.data.pagination;
    return {
      items,
      next: pagination && pagination.next_page_url ? String(page + 1) : undefined
    };
  }

  // 4. Secciones generales del catálogo
  let url;
  if (ref === "movies:upcoming") {
    url = `${BASE_API}/listing/movies?page=${page}&orderBy=ID&order=desc&postType=movies&postsPerPage=25&filter=${encodeURIComponent(JSON.stringify({ years: [74006, 4] }))}`;
  } else if (ref === "movies:popular") {
    url = `${BASE_API}/listing/movies?page=${page}&orderBy=views&order=desc&postType=movies&postsPerPage=20`;
  } else if (ref === "tvshows:popular") {
    url = `${BASE_API}/listing/tvshows?page=${page}&orderBy=views&order=desc&postType=tvshows&postsPerPage=20`;
  } else if (ref === "novels:popular") {
    url = `${BASE_API}/listing/novels?page=${page}&orderBy=views&order=desc&postType=novels&postsPerPage=20`;
  } else if (ref === "animes:popular") {
    url = `${BASE_API}/listing/animes?page=${page}&orderBy=views&order=desc&postType=animes&postsPerPage=20`;
  } else if (ref.startsWith("novels")) {
    url = `${BASE_API}/listing/novels?page=${page}&orderBy=ID&order=desc&postType=novels&postsPerPage=20`;
  } else if (ref.startsWith("wwe")) {
    url = `${BASE_API}/listing/wwe?page=${page}&orderBy=ID&order=desc&postType=wwe&postsPerPage=20`;
  } else if (ref.startsWith("collections")) {
    const colPage = ref === "collections:latest" ? page : (parseInt(ref.replace("collections:p", ""), 10) || page);
    const effectivePage = cursor ? page : colPage;
    url = `${BASE_API}/listing/collections?page=${effectivePage}&orderBy=ID&order=desc&postType=collections&postsPerPage=20`;
  } else if (ref.startsWith("animes")) {
    const animePage = ref === "animes:latest" ? page : (parseInt(ref.replace("animes:page", ""), 10) || page);
    const effectivePage = cursor ? page : animePage;
    url = `${BASE_API}/listing/animes?page=${effectivePage}&orderBy=ID&order=desc&postType=animes&postsPerPage=20`;
  } else if (ref.startsWith("tvshows")) {
    url = `${BASE_API}/listing/tvshows?page=${page}&orderBy=ID&order=desc&postType=tvshows&postsPerPage=20`;
  } else if (ref.startsWith("animes")) {
    url = `${BASE_API}/listing/animes?page=${page}&orderBy=ID&order=desc&postType=animes&postsPerPage=20`;
  } else {
    url = `${BASE_API}/listing/movies?page=${page}&orderBy=ID&order=desc&postType=movies&postsPerPage=20`;
  }

  const r = await kino.fetch(url);
  if (!r.ok) throw kino.error("unavailable", `Error al cargar catálogo (${r.status})`);

  const data = r.json();
  const rawPosts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
  const items = rawPosts.map(toItem).filter(Boolean);

  const pagination = data && data.data && data.data.pagination;
  const hasNext = pagination && pagination.next_page_url;

  return {
    items,
    next: hasNext ? String(page + 1) : undefined
  };
}

/**
 * Lista de episodios y temporadas para series, anime, novelas, sagas o filmografías de actores.
 */
export async function episodes(ref) {
  await null;

  // 1. Episodios de Anime Kitsu
  if (ref.startsWith("kitsu:")) {
    const kitsuId = ref.split(":")[1];
    if (!kitsuId) throw kino.error("not_found", "Anime no encontrado");
    const epUrl = `https://kitsu.io/api/edge/anime/${encodeURIComponent(kitsuId)}/episodes?page[limit]=100`;
    const r = await kino.fetch(epUrl);
    if (!r.ok) throw kino.error("unavailable", `Error al obtener episodios (${r.status})`);
    const data = r.json();
    const rawEps = data && Array.isArray(data.data) ? data.data : [];
    if (rawEps.length === 0) throw kino.error("not_found", "No se encontraron episodios para este anime");

    const epList = rawEps.map(e => {
      const num = e.attributes?.number || 1;
      const t = e.attributes?.canonicalTitle || `Episodio ${num}`;
      return {
        season: 1,
        number: num,
        ref: `kitsu_ep:${kitsuId}:${num}`,
        title: t,
        overview: e.attributes?.synopsis || undefined,
        still: e.attributes?.thumbnail?.original || undefined
      };
    });

    return {
      episodes: epList,
      seasons: [
        {
          id: `kitsu-${kitsuId}-s1`,
          ref: `kitsu:${kitsuId}`,
          title: "Temporada 1",
          number: 1,
          current: true
        }
      ]
    };
  }

  // 2. Filmografía del actor mostrada como episodios/títulos interactivos
  if (ref.startsWith("actor:")) {
    const actorId = parseInt(ref.split(":")[1], 10);
    if (!actorId) throw kino.error("not_found", "Actor no encontrado");

    const filterParam = encodeURIComponent(JSON.stringify({ cast: [actorId] }));
    const url = `${BASE_API}/listing/movies?page=1&orderBy=ID&order=desc&postType=movies&postsPerPage=40&filter=${filterParam}`;
    const r = await kino.fetch(url);
    if (!r.ok) throw kino.error("unavailable", `Error al obtener filmografía (${r.status})`);

    const data = r.json();
    const rawPosts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
    if (rawPosts.length === 0) throw kino.error("not_found", "No se encontraron títulos para este actor");

    const episodesList = rawPosts.map((post, idx) => {
      let still;
      if (post.images && post.images.poster) {
        still = post.images.poster.startsWith("http")
          ? post.images.poster
          : `${UPLOADS_BASE}${post.images.poster}`;
      }
      return {
        season: 1,
        number: idx + 1,
        ref: `movies:${post._id}`,
        title: (post.title || `Título ${idx + 1}`).replace(/\s*\(\d{4}\)\s*$/, "").trim(),
        overview: post.overview || undefined,
        still
      };
    });

    return {
      episodes: episodesList,
      seasons: [
        {
          id: `actor-${actorId}-s1`,
          ref: `actor:${actorId}`,
          title: "Películas",
          number: 1,
          current: true
        }
      ]
    };
  }

  // 2. Títulos de una colección / saga
  if (ref.startsWith("collection:")) {
    const parts = ref.split(":");
    const colId = parts[1];
    if (!colId) throw kino.error("not_found", "Colección no encontrada");

    // Si el usuario seleccionó una serie específica dentro de la colección: collection:ID:series:SERIES_ID(:SEASON)?
    if (parts.length >= 4 && (parts[2] === "series" || parts[2] === "tvshows" || parts[2] === "animes" || parts[2] === "novels")) {
      const seriesType = parts[2];
      const seriesId = parts[3];
      const targetSeason = parts[4] ? parseInt(parts[4], 10) : 1;
      
      const seriesEpResult = await episodes(`${seriesType}:${seriesId}:${targetSeason}`);

      // Mantener siempre accesible la opción de volver a la lista general de la colección
      // y conmutar entre las series de la colección sin salirse a la pantalla anterior
      const combinedSeasons = [
        {
          id: `col-${colId}-all`,
          ref: `collection:${colId}`,
          title: "↩ Elegir otra serie / Volver a la lista",
          number: 0,
          current: false
        }
      ];

      if (seriesEpResult && Array.isArray(seriesEpResult.seasons)) {
        for (const s of seriesEpResult.seasons) {
          combinedSeasons.push({
            id: s.id,
            ref: `collection:${colId}:${seriesType}:${seriesId}:${s.number}`,
            title: s.title,
            number: s.number,
            current: s.current
          });
        }
      }

      return {
        episodes: seriesEpResult.episodes,
        seasons: combinedSeasons
      };
    }

    // Endpoint directo para obtener todas las películas/series de la colección con nombre real y póster oficial
    const listingRes = await kino.fetch(`${BASE_API}/collection/${encodeURIComponent(colId)}/listing`);
    if (listingRes.ok) {
      const lData = listingRes.json();
      const rawPosts = lData && lData.data && Array.isArray(lData.data.posts) ? lData.data.posts : [];
      if (rawPosts.length > 0) {
        const episodesList = rawPosts.map((m, idx) => {
          let still;
          if (m.images && m.images.poster) {
            still = m.images.poster.startsWith("http")
              ? m.images.poster
              : `${UPLOADS_BASE}${m.images.poster}`;
          }
          const itemType = m.type || (m.season_number ? "tvshows" : "movies");
          return {
            season: 1,
            number: idx + 1,
            ref: `${itemType}:${m._id}`,
            title: (m.title || `Título ${idx + 1}`).replace(/\s*\(\d{4}\)\s*$/, "").trim(),
            overview: m.overview || undefined,
            still
          };
        });

        const hasSeries = rawPosts.some(item => item.type === "tvshows" || item.type === "animes" || item.type === "novels");
        const listTitle = hasSeries ? "Elegir serie / Títulos" : `${rawPosts.length} Películas`;

        // Crear selector de temporadas/títulos con las series incluidas para navegar directamente
        const seasonsList = [
          {
            id: `col-${colId}-s1`,
            ref: `collection:${colId}`,
            title: listTitle,
            number: 1,
            current: true
          }
        ];

        for (const item of rawPosts) {
          if (item.type === "tvshows" || item.type === "animes" || item.type === "novels") {
            seasonsList.push({
              id: `series-${item._id}`,
              ref: `collection:${colId}:${item.type}:${item._id}`,
              title: `📺 ${(item.title || "Serie").replace(/\s*\(\d{4}\)\s*$/, "").trim()}`
            });
          }
        }

        return {
          episodes: episodesList,
          seasons: seasonsList
        };
      }
    }

    // Fallback de respaldo por páginas de colecciones si el endpoint directo no responde
    const colPages = await Promise.all([
      kino.fetch(`${BASE_API}/listing/collections?page=1&orderBy=ID&order=desc&postType=collections&postsPerPage=30`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/collections?page=2&orderBy=ID&order=desc&postType=collections&postsPerPage=30`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/collections?page=3&orderBy=ID&order=desc&postType=collections&postsPerPage=30`).catch(() => null),
      kino.fetch(`${BASE_API}/listing/collections?page=4&orderBy=ID&order=desc&postType=collections&postsPerPage=30`).catch(() => null)
    ]);

    let matchCol = null;
    for (const res of colPages) {
      if (res && res.ok) {
        const cData = res.json();
        const posts = cData && cData.data && Array.isArray(cData.data.posts) ? cData.data.posts : [];
        const found = posts.find(c => String(c._id) === String(colId));
        if (found) {
          matchCol = found;
          break;
        }
      }
    }

    if (!matchCol || !Array.isArray(matchCol.posts) || matchCol.posts.length === 0) {
      throw kino.error("not_found", "No se encontraron títulos en esta saga");
    }

    const allStills = [];
    if (Array.isArray(matchCol.galleries)) {
      for (const g of matchCol.galleries) {
        if (typeof g === "string") {
          for (const line of g.split("\n")) {
            const clean = line.trim();
            if (clean) allStills.push(clean.startsWith("http") ? clean : `https://image.tmdb.org/t/p/w500${clean}`);
          }
        }
      }
    }

    const episodesList = matchCol.posts.map((pid, idx) => ({
      season: 1,
      number: idx + 1,
      ref: `movies:${pid}`,
      title: `Película #${idx + 1}`,
      still: allStills[idx] || undefined
    }));

    return {
      episodes: episodesList,
      seasons: [
        {
          id: `col-${colId}-s1`,
          ref: `collection:${colId}`,
          title: matchCol.title || "Películas de la saga",
          number: 1,
          current: true
        }
      ]
    };
  }

  // 3. Series, animes y novelas estándar
  const parts = ref.split(":");
  const type = parts[0] || "tvshows";
  const seriesId = parts[1];
  const selectedSeason = parts[2] ? parseInt(parts[2], 10) : 1;

  if (!seriesId) throw kino.error("not_found", "ID de contenido no especificado");

  const url = `${BASE_API}/single/episodes/list?_id=${encodeURIComponent(seriesId)}&season=${selectedSeason}&page=1&postsPerPage=100`;
  const r = await kino.fetch(url);
  if (!r.ok) {
    if (r.status === 404) throw kino.error("not_found", "Contenido o temporada no encontrada");
    throw kino.error("unavailable", `Error al obtener episodios (${r.status})`);
  }

  const data = r.json();
  const rawPosts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
  if (rawPosts.length === 0) throw kino.error("not_found", "No se encontraron episodios");

  const episodesList = rawPosts.map(post => {
    let still;
    if (post.still_path) {
      still = post.still_path.startsWith("http")
        ? post.still_path
        : `https://image.tmdb.org/t/p/w500${post.still_path}`;
    }
    return {
      season: post.season_number || selectedSeason,
      number: post.episode_number || 1,
      ref: `episode:${post._id}`,
      title: post.title || `Capítulo ${post.episode_number || 1}`,
      overview: post.overview || undefined,
      still
    };
  });

  const seasonsList = [];
  if (data && data.data && Array.isArray(data.data.seasons)) {
    const sorted = data.data.seasons.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
    for (const sNum of sorted) {
      seasonsList.push({
        id: `${type}-${seriesId}-${sNum}`,
        ref: `${type}:${seriesId}:${sNum}`,
        title: `Temporada ${sNum}`,
        number: sNum,
        current: sNum === selectedSeason
      });
    }
  }

  return {
    episodes: episodesList,
    seasons: seasonsList.length > 0 ? seasonsList : undefined
  };
}

/**
 * Desempaqueta código empaquetado con Dean Edwards p,a,c,k,e,d.
 */
function unpackDeanEdwards(html) {
  const m = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]+?\.split\('\|'\)\)\)/);
  if (!m) return null;
  try {
    const fnBody = m[0].replace(/^eval/, "return ");
    return new Function(fnBody)();
  } catch (_) {
    return null;
  }
}

/**
 * Extrae pistas de subtítulos del script del reproductor.
 */
function extractSubtitles(code) {
  const subs = [];
  const regex = /file:\s*["'](https?:\/\/[^"']+\.vtt[^"']*)["'][^}]*label:\s*["']([^"']+)["']/g;
  let m;
  while ((m = regex.exec(code)) !== null) {
    const label = m[2] || "Español";
    const lang = label.toLowerCase().includes("span") || label.toLowerCase().includes("es") ? "es" : "en";
    subs.push({
      url: m[1],
      lang,
      format: "vtt"
    });
  }
  return subs.slice(0, 30);
}

/**
 * Resuelve una película o capítulo en un stream reproducible (HLS master .m3u8).
 */
export async function resolve(ref) {
  await null;

  const parts = ref.split(":");
  let postId = parts.pop();
  const type = parts[0] || "";
  if (!postId) throw kino.error("not_found", "ID de contenido no válido");

  // Si el ref corresponde a un episodio de Kitsu (kitsu_ep:kitsuId:epNum)
  if (ref.startsWith("kitsu_ep:")) {
    const [, kitsuId, epNumStr] = ref.split(":");
    const epNum = parseInt(epNumStr, 10) || 1;

    // Obtener detalles y títulos del anime desde la API de Kitsu
    const kitsuRes = await kino.fetch(`https://kitsu.io/api/edge/anime/${encodeURIComponent(kitsuId)}`);
    if (!kitsuRes.ok) throw kino.error("unavailable", `Error al conectar con Kitsu (${kitsuRes.status})`);
    const kitsuData = kitsuRes.json();
    const attr = kitsuData && kitsuData.data ? kitsuData.data.attributes : {};
    const titles = attr.titles || {};
    const candidates = [
      attr.canonicalTitle,
      titles.en,
      titles.en_jp,
      titles.en_us,
      titles.ja_jp
    ].filter(Boolean);

    let matchedLaMoviePost = null;
    for (const titleCandidate of candidates) {
      try {
        const sRes = await kino.fetch(`${BASE_API}/search?q=${encodeURIComponent(titleCandidate)}&postType=animes`);
        if (sRes.ok) {
          const sData = sRes.json();
          const posts = sData && sData.data && Array.isArray(sData.data.posts) ? sData.data.posts : [];
          if (posts.length > 0) {
            matchedLaMoviePost = posts[0];
            break;
          }
        }
      } catch (_) {
        // Seguir probando candidatos
      }
    }

    if (!matchedLaMoviePost) {
      throw kino.error("not_found", "Anime no disponible en servidores de video", {
        userMessage: `El anime "${attr.canonicalTitle || "solicitado"}" aún no cuenta con servidores de video compatibles en el catálogo latino.`
      });
    }

    // Buscar el episodio específico en LaMovie
    const epListUrl = `${BASE_API}/single/episodes/list?_id=${encodeURIComponent(matchedLaMoviePost._id)}&season=1&page=1&postsPerPage=100`;
    const epListRes = await kino.fetch(epListUrl);
    if (!epListRes.ok) {
      throw kino.error("unavailable", `Error al buscar episodios en el servidor (${epListRes.status})`);
    }

    const epListData = epListRes.json();
    const posts = epListData && epListData.data && Array.isArray(epListData.data.posts) ? epListData.data.posts : [];
    const matchedEp = posts.find(p => p.episode_number === epNum) || posts[epNum - 1] || posts[0];

    if (!matchedEp || !matchedEp._id) {
      throw kino.error("not_found", `Episodio ${epNum} no disponible en streaming`);
    }

    postId = String(matchedEp._id);
  }

  // Si se solicita reproducir una serie directamente (ej. desde una colección de series),
  // se obtiene automáticamente su primer episodio
  if (type === "tvshows" || type === "animes" || type === "novels") {
    try {
      const epUrl = `${BASE_API}/single/episodes/list?_id=${encodeURIComponent(postId)}&season=1&page=1&postsPerPage=1`;
      const epRes = await kino.fetch(epUrl);
      if (epRes.ok) {
        const epData = epRes.json();
        const firstEp = epData && epData.data && Array.isArray(epData.data.posts) ? epData.data.posts[0] : null;
        if (firstEp && firstEp._id) {
          postId = String(firstEp._id);
        }
      }
    } catch (_) {
      // Intentar reproducir con postId original si falla la llamada
    }
  }

  const playerUrl = `${BASE_API}/player?postId=${encodeURIComponent(postId)}&demo=0`;
  const playerRes = await kino.fetch(playerUrl);
  if (!playerRes.ok) {
    if (playerRes.status === 404) throw kino.error("not_found", "Contenido no disponible");
    throw kino.error("unavailable", `Servidor no disponible (${playerRes.status})`);
  }

  const playerData = playerRes.json();
  const rawEmbeds = playerData && playerData.data && Array.isArray(playerData.data.embeds)
    ? playerData.data.embeds
    : [];

  if (rawEmbeds.length === 0) {
    throw kino.error("not_found", "No hay servidores de video disponibles", {
      userMessage: "Este título aún no tiene servidores de video cargados por el proveedor."
    });
  }

  // Filtrar servidores oficiales que no tienen el video subido aún (pantallas de reemplazo 'embed.html?v=1')
  const validEmbeds = rawEmbeds.filter(e => e && e.url && !e.url.includes("embed.html?v=1"));

  if (validEmbeds.length === 0) {
    throw kino.error("not_found", "Contenido aún no disponible en los servidores", {
      userMessage: "Este episodio o película aún no ha sido subido a los servidores de streaming por el proveedor. Intenta nuevamente más tarde."
    });
  }

  const sortedEmbeds = [...validEmbeds].sort((a, b) => {
    const aIsVimeos = (a.url || "").includes("vimeos.net") || (a.url || "").includes("videoapp.zip");
    const bIsVimeos = (b.url || "").includes("vimeos.net") || (b.url || "").includes("videoapp.zip");
    if (aIsVimeos && !bIsVimeos) return -1;
    if (!aIsVimeos && bIsVimeos) return 1;
    return 0;
  });

  const resolvedStreams = [];

  for (const embed of sortedEmbeds) {
    if (!embed || !embed.url) continue;

    let targetEmbedUrl = embed.url;

    if (targetEmbedUrl.includes("videoapp.zip")) {
      try {
        const vResp = await kino.fetch(targetEmbedUrl, {
          headers: {
            "Referer": "https://lamovie.org/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
          }
        });
        if (vResp.ok) {
          const vHtml = vResp.text();
          const iframeMatch = vHtml.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/i);
          if (iframeMatch && iframeMatch[1]) {
            targetEmbedUrl = iframeMatch[1];
          }
        }
      } catch (_) {
        // Continuar intentando
      }
    }

    if (targetEmbedUrl.includes("vimeos.net")) {
      try {
        const embedRes = await kino.fetch(targetEmbedUrl, {
          headers: {
            "Referer": "https://lamovie.org/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
          }
        });

        if (embedRes.ok) {
          const embedHtml = embedRes.text();
          const unpacked = unpackDeanEdwards(embedHtml);
          if (unpacked) {
            const m3u8Match = unpacked.match(/file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
            if (m3u8Match && m3u8Match[1]) {
              const subtitles = extractSubtitles(unpacked);
              const label = embed.server ? `${embed.server} · ${embed.quality || "HD"}` : (embed.quality || "HD");
              resolvedStreams.push({
                url: m3u8Match[1],
                mime: "application/vnd.apple.mpegurl",
                headers: {
                  "Referer": "https://vimeos.net/",
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
                },
                subtitles: subtitles.length > 0 ? subtitles : undefined,
                label
              });
            }
          }
        }
      } catch (_) {
        // Continuar con el siguiente embed
      }
    }
  }

  if (resolvedStreams.length > 0) {
    const primary = resolvedStreams[0];
    if (resolvedStreams.length > 1) {
      primary.alternatives = resolvedStreams.slice(1).map(alt => ({
        url: alt.url,
        mime: alt.mime,
        headers: alt.headers,
        label: alt.label
      }));
    }
    return primary;
  }

  throw kino.error("not_found", "No se pudo extraer un enlace de video compatible");
}
