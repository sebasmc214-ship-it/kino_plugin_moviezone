// MovieZone - Plugin de Kino para LaMovie (Películas, series y anime en español)
// Ejecutado en QuickJS. Sin require, process, Buffer, setTimeout ni fetch nativo.

const BASE_API = "https://lamovie.org/wp-api/v1";
const UPLOADS_BASE = "https://lamovie.org/wp-content/uploads";

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

  const isSeries = post.type === "tvshows" || post.type === "animes" || post.type === "novels";
  const kind = isSeries ? "series" : "movie";
  const id = `${kind}-${post._id}`;
  const ref = `${post.type || (isSeries ? "tvshows" : "movies")}:${post._id}`;

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
  if (post.images && post.images.poster) {
    poster = post.images.poster.startsWith("http")
      ? post.images.poster
      : `${UPLOADS_BASE}${post.images.poster}`;
  }

  let backdrop;
  if (post.images && post.images.backdrop) {
    backdrop = post.images.backdrop.startsWith("http")
      ? post.images.backdrop
      : `${UPLOADS_BASE}${post.images.backdrop}`;
  }

  let rating;
  if (post.rating) {
    const r = parseFloat(post.rating);
    if (!isNaN(r) && r >= 0 && r <= 10) rating = r;
  }

  const genres = [];
  if (Array.isArray(post.genres)) {
    for (const gId of post.genres) {
      const slug = GENRE_MAP[gId];
      if (slug && !genres.includes(slug)) genres.push(slug);
      if (genres.length >= 5) break;
    }
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
    genres: genres.length > 0 ? genres : undefined
  };
}

/**
 * Busca títulos en LaMovie.
 */
export async function search(query) {
  // Evitar error antes del primer await en versiones viejas de Kino
  await null;

  if (!query || !query.q || !query.q.trim()) return [];

  const q = encodeURIComponent(query.q.trim());
  const r = await kino.fetch(`${BASE_API}/search?q=${q}&postType=any&postsPerPage=40`);
  if (!r.ok) {
    if (r.status === 429) throw kino.error("rate_limited", "Límite de peticiones");
    throw kino.error("unavailable", `Error de búsqueda ${r.status}`);
  }

  const res = r.json();
  const rawPosts = res && res.data && Array.isArray(res.data.posts) ? res.data.posts : [];
  const items = rawPosts.map(toItem).filter(Boolean);

  if (query.type === "movie" || query.type === "series") {
    return [
      ...items.filter(x => x.kind === query.type),
      ...items.filter(x => x.kind !== query.type)
    ];
  }

  return items;
}

/**
 * Filas de la pantalla de Inicio de Kino agrupadas por categorías.
 */
export async function home() {
  await null;

  const [slidersRes, moviesRes, seriesRes, animesRes] = await Promise.all([
    kino.fetch(`${BASE_API}/sliders?page=1&postType=movies&postsPerPage=20`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/movies?page=1&orderBy=ID&order=desc&postType=movies&postsPerPage=20`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/tvshows?page=1&orderBy=ID&order=desc&postType=tvshows&postsPerPage=20`).catch(() => null),
    kino.fetch(`${BASE_API}/listing/animes?page=1&orderBy=ID&order=desc&postType=animes&postsPerPage=20`).catch(() => null)
  ]);

  const rows = [];

  if (slidersRes && slidersRes.ok) {
    const data = slidersRes.json();
    const posts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
    const items = posts.map(toItem).filter(Boolean);
    if (items.length > 0) {
      rows.push({
        id: "estrenos",
        title: "Estrenos destacados",
        ref: "movies:sliders",
        genre: "peliculas",
        items
      });
    }
  }

  if (moviesRes && moviesRes.ok) {
    const data = moviesRes.json();
    const posts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
    const items = posts.map(toItem).filter(Boolean);
    if (items.length > 0) {
      rows.push({
        id: "peliculas-recientes",
        title: "Películas recientes",
        ref: "movies:latest",
        genre: "peliculas",
        items
      });
    }
  }

  if (seriesRes && seriesRes.ok) {
    const data = seriesRes.json();
    const posts = data && data.data && Array.isArray(data.data.posts) ? data.data.posts : [];
    const items = posts.map(toItem).filter(Boolean);
    if (items.length > 0) {
      rows.push({
        id: "series-recientes",
        title: "Series de televisión",
        ref: "tvshows:latest",
        genre: "series",
        items
      });
    }
  }

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

  return rows;
}

/**
 * Paginación de "Ver más" para cada sección del catálogo.
 */
export async function browse(ref, cursor) {
  await null;

  const page = cursor ? parseInt(cursor, 10) || 1 : 1;
  let url;

  if (ref === "movies:sliders") {
    url = `${BASE_API}/sliders?page=${page}&postType=movies&postsPerPage=20`;
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
 * Lista de episodios y temporadas para series y anime.
 */
export async function episodes(ref) {
  await null;

  const parts = ref.split(":");
  const type = parts[0] || "tvshows";
  const seriesId = parts[1];
  const selectedSeason = parts[2] ? parseInt(parts[2], 10) : 1;

  if (!seriesId) throw kino.error("not_found", "ID de serie no especificado");

  const url = `${BASE_API}/single/episodes/list?_id=${encodeURIComponent(seriesId)}&season=${selectedSeason}&page=1&postsPerPage=100`;
  const r = await kino.fetch(url);
  if (!r.ok) {
    if (r.status === 404) throw kino.error("not_found", "Serie o temporada no encontrada");
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
  const postId = parts.pop();
  if (!postId) throw kino.error("not_found", "ID de contenido no válido");

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

  // Ordenar embeds priorizando LaMovie (vimeos.net) y videoapp.zip
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

    // Si viene de videoapp.zip, extraer el iframe interno de vimeos.net
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
        // Continuar intentando con la URL directa
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
        // Pasar al siguiente servidor si este falla
      }
    }
  }

  throw kino.error("not_found", "No se pudo extraer un enlace de video compatible");
}
