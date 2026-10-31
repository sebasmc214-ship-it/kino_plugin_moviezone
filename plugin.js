// MovieZone - Plugin de Kino para LaMovie (Películas, series, novelas, anime, colecciones y sagas)
// Ejecutado en QuickJS. Sin require, process, Buffer, setTimeout ni fetch nativo.

const BASE_API = "https://lamovie.org/wp-api/v1";
const UPLOADS_BASE = "https://lamovie.org/wp-content/uploads";
const BRAND_BANNER = "https://raw.githubusercontent.com/sebasmc214-ship-it/kino_plugin_moviezone/main/banner.jpg";

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
 * Busca títulos en LaMovie.
 */
export async function search(query) {
  await null;

  if (!query || !query.q || !query.q.trim()) return [];

  const rawTerm = query.q.trim();
  const q = encodeURIComponent(rawTerm);

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

  const [
    upcomingRes,
    popularMoviesRes,
    latestMoviesRes,
    seriesRes,
    novelsRes,
    animesRes,
    collectionsRes,
    actorsRes
  ] = await Promise.all([
    kino.fetch(`${BASE_API}/listing/up`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/movies?page=1&orderBy=views&order=desc&postType=movies&postsPerPage=20`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/movies?page=1&orderBy=ID&order=desc&postType=movies&postsPerPage=35`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/tvshows?page=1&orderBy=ID&order=desc&postType=tvshows&postsPerPage=20`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/novels?page=1&orderBy=ID&order=desc&postType=novels&postsPerPage=20`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/animes?page=1&orderBy=ID&order=desc&postType=animes&postsPerPage=20`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/collections?page=1&orderBy=ID&order=desc&postType=collections&postsPerPage=20`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/tax/cast?page=1&orderBy=latest&order=desc&postsPerPage=20`).catch(() => null)
  ]);

  const rows = [];

  // 1. Estrenos destacados (combina títulos de cartelera /up con últimos estrenos agregados)
  const premierItemsMap = new Map();
  if (upcomingRes && upcomingRes.ok) {
    const data = upcomingRes.json();
    const posts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
    for (const post of posts) {
      const item = toItem(post);
      if (item && !premierItemsMap.has(item.id)) premierItemsMap.set(item.id, item);
    }
  }
  if (latestMoviesRes && latestMoviesRes.ok) {
    const data = latestMoviesRes.json();
    const posts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
    for (const post of posts) {
      const item = toItem(post);
      if (item && !premierItemsMap.has(item.id)) premierItemsMap.set(item.id, item);
      if (premierItemsMap.size >= 30) break;
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

  return rows;
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
  if (ref === "cast:latest") {
    const url = `${BASE_API}/listing/tax/cast?page=${page}&orderBy=latest&order=desc&postsPerPage=20`;
    const r = await kino.fetch(url);
    if (!r.ok) throw kino.error("unavailable", `Error al cargar actores (${r.status})`);
    const data = r.json();
    const rawItems = data && data.data && Array.isArray(data.data.items) ? data.data.items : [];
    const items = rawItems.map(toActorItem).filter(Boolean);
    const pagination = data && data.data && data.data.pagination;
    return {
      items,
      next: pagination && pagination.next_page_url ? String(page + 1) : undefined
    };
  }

  // 3. Secciones generales del catálogo
  let url;
  if (ref === "movies:upcoming") {
    url = `${BASE_API}/listing/movies?page=${page}&orderBy=ID&order=desc&postType=movies&postsPerPage=25`;
  } else if (ref === "movies:popular") {
    url = `${BASE_API}/listing/movies?page=${page}&orderBy=views&order=desc&postType=movies&postsPerPage=20`;
  } else if (ref.startsWith("novels")) {
    url = `${BASE_API}/listing/novels?page=${page}&orderBy=ID&order=desc&postType=novels&postsPerPage=20`;
  } else if (ref.startsWith("wwe")) {
    url = `${BASE_API}/listing/wwe?page=${page}&orderBy=ID&order=desc&postType=wwe&postsPerPage=20`;
  } else if (ref.startsWith("collections")) {
    url = `${BASE_API}/listing/collections?page=${page}&orderBy=ID&order=desc&postType=collections&postsPerPage=20`;
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

  // 1. Filmografía del actor mostrada como episodios/títulos interactivos
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
      return await episodes(`${seriesType}:${seriesId}:${targetSeason}`);
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

        // Crear selector de temporadas/títulos con las series incluidas para navegar directamente
        const seasonsList = [
          {
            id: `col-${colId}-s1`,
            ref: `collection:${colId}`,
            title: "Títulos de la colección",
            number: 1,
            current: true
          }
        ];

        for (const item of rawPosts) {
          if (item.type === "tvshows" || item.type === "animes" || item.type === "novels") {
            seasonsList.push({
              id: `series-${item._id}`,
              ref: `collection:${colId}:${item.type}:${item._id}`,
              title: (item.title || "Serie").replace(/\s*\(\d{4}\)\s*$/, "").trim()
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
    throw kino.error("not_found", "No hay servidores de video disponibles");
  }

  const sortedEmbeds = [...rawEmbeds].sort((a, b) => {
    const aIsVimeos = (a.url || "").includes("vimeos.net") || (a.url || "").includes("videoapp.zip");
    const bIsVimeos = (b.url || "").includes("vimeos.net") || (b.url || "").includes("videoapp.zip");
    if (aIsVimeos && !bIsVimeos) return -1;
    if (!aIsVimeos && bIsVimeos) return 1;
    return 0;
  });

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
              return {
                url: m3u8Match[1],
                mime: "application/vnd.apple.mpegurl",
                headers: {
                  "Referer": "https://vimeos.net/",
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
                },
                subtitles: subtitles.length > 0 ? subtitles : undefined
              };
            }
          }
        }
      } catch (_) {
        // Continuar con el siguiente embed
      }
    }
  }

  throw kino.error("not_found", "No se pudo extraer un enlace de video compatible");
}
