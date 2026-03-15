import { AppState, Movie } from "@/lib/types";
import { slugify, startOfWeek } from "@/lib/utils";

const movies: Movie[] = [
  {
    id: "movie_arrival",
    slug: slugify("Arrival"),
    title: "Arrival",
    year: 2016,
    synopsis:
      "Una lingüista es reclutada para comunicarse con unas naves extraterrestres recién llegadas, mientras descubre que el lenguaje puede alterar la forma en que entendemos el tiempo y nuestras decisiones.",
    durationMinutes: 116,
    genres: ["Ciencia ficción", "Drama", "Misterio"],
    director: "Denis Villeneuve",
    cast: ["Amy Adams", "Jeremy Renner", "Forest Whitaker"],
    language: "Inglés",
    country: "Estados Unidos",
    trailerUrl: "https://www.youtube.com/watch?v=tFMo3UJ4B4g",
    externalRating: {
      source: "Rotten Tomatoes",
      value: "94%"
    },
    sourceIds: {
      tmdb: "329865"
    }
  },
  {
    id: "movie_drive_my_car",
    slug: slugify("Drive My Car"),
    title: "Drive My Car",
    year: 2021,
    synopsis:
      "Tras una pérdida devastadora, un actor y director de teatro forma un vínculo inesperado con la joven conductora que lo acompaña durante el montaje de una obra de Chéjov.",
    durationMinutes: 179,
    genres: ["Drama"],
    director: "Ryusuke Hamaguchi",
    cast: ["Hidetoshi Nishijima", "Toko Miura", "Masaki Okada"],
    language: "Japonés",
    country: "Japón",
    trailerUrl: "https://www.youtube.com/watch?v=6BPKPb_RTwI",
    externalRating: {
      source: "Rotten Tomatoes",
      value: "97%"
    },
    sourceIds: {
      tmdb: "490132"
    }
  },
  {
    id: "movie_parasite",
    slug: slugify("Parasite"),
    title: "Parasite",
    year: 2019,
    synopsis:
      "Una familia con pocos recursos se infiltra gradualmente en el hogar de una familia adinerada, provocando un juego de apariencias que termina en una espiral imprevisible.",
    durationMinutes: 132,
    genres: ["Thriller", "Drama", "Comedia negra"],
    director: "Bong Joon-ho",
    cast: ["Song Kang-ho", "Lee Sun-kyun", "Cho Yeo-jeong"],
    language: "Coreano",
    country: "Corea del Sur",
    trailerUrl: "https://www.youtube.com/watch?v=5xH0HfJHsaY",
    externalRating: {
      source: "Rotten Tomatoes",
      value: "99%"
    },
    sourceIds: {
      tmdb: "496243"
    }
  },
  {
    id: "movie_aftersun",
    slug: slugify("Aftersun"),
    title: "Aftersun",
    year: 2022,
    synopsis:
      "Una joven adulta recuerda unas vacaciones de verano con su padre y trata de recomponer lo que entonces no supo ver: la fragilidad escondida tras los momentos cotidianos.",
    durationMinutes: 101,
    genres: ["Drama"],
    director: "Charlotte Wells",
    cast: ["Paul Mescal", "Frankie Corio", "Celia Rowlson-Hall"],
    language: "Inglés",
    country: "Reino Unido",
    trailerUrl: "https://www.youtube.com/watch?v=vXKcWRu8K_U",
    externalRating: {
      source: "IMDb",
      value: "8.1/10"
    },
    sourceIds: {
      tmdb: "965150"
    }
  },
  {
    id: "movie_blade_runner_2049",
    slug: slugify("Blade Runner 2049"),
    title: "Blade Runner 2049",
    year: 2017,
    synopsis:
      "Un blade runner descubre un secreto capaz de alterar el equilibrio de una sociedad distópica, lo que lo lleva a buscar a un antiguo desaparecido y enfrentarse a la memoria de todo un mundo.",
    durationMinutes: 164,
    genres: ["Ciencia ficción", "Neo-noir"],
    director: "Denis Villeneuve",
    cast: ["Ryan Gosling", "Harrison Ford", "Ana de Armas"],
    language: "Inglés",
    country: "Estados Unidos",
    trailerUrl: "https://www.youtube.com/watch?v=gCcx85zbxz4",
    externalRating: {
      source: "Rotten Tomatoes",
      value: "88%"
    },
    sourceIds: {
      tmdb: "335984"
    }
  },
  {
    id: "movie_the_holdovers",
    slug: slugify("The Holdovers"),
    title: "The Holdovers",
    year: 2023,
    synopsis:
      "Un profesor cascarrabias, un alumno sin hogar para Navidad y la cocinera del internado pasan juntos las fiestas y descubren una forma torpe pero sincera de cuidarse.",
    durationMinutes: 133,
    genres: ["Comedia dramática"],
    director: "Alexander Payne",
    cast: ["Paul Giamatti", "Da'Vine Joy Randolph", "Dominic Sessa"],
    language: "Inglés",
    country: "Estados Unidos",
    trailerUrl: "https://www.youtube.com/watch?v=AhKLpJmHhIg",
    externalRating: {
      source: "Rotten Tomatoes",
      value: "97%"
    },
    sourceIds: {
      tmdb: "840430"
    }
  },
  {
    id: "movie_before_sunrise",
    slug: slugify("Before Sunrise"),
    title: "Before Sunrise",
    year: 1995,
    synopsis:
      "Dos desconocidos se conocen en un tren y deciden pasar una noche recorriendo Viena, hablándose con una intimidad extraña que convierte las horas en un pequeño universo propio.",
    durationMinutes: 101,
    genres: ["Romance", "Drama"],
    director: "Richard Linklater",
    cast: ["Ethan Hawke", "Julie Delpy"],
    language: "Inglés",
    country: "Estados Unidos",
    trailerUrl: "https://www.youtube.com/watch?v=6MUcuqbGTxc",
    externalRating: {
      source: "Rotten Tomatoes",
      value: "100%"
    },
    sourceIds: {
      tmdb: "76"
    }
  },
  {
    id: "movie_memories_of_murder",
    slug: slugify("Memories of Murder"),
    title: "Memories of Murder",
    year: 2003,
    synopsis:
      "Dos detectives investigan una serie de asesinatos en una Corea rural marcada por la frustración, la violencia institucional y la imposibilidad de cerrar el caso con certezas.",
    durationMinutes: 132,
    genres: ["Thriller", "Crimen", "Drama"],
    director: "Bong Joon-ho",
    cast: ["Song Kang-ho", "Kim Sang-kyung", "Kim Roe-ha"],
    language: "Coreano",
    country: "Corea del Sur",
    trailerUrl: "https://www.youtube.com/watch?v=0n_HQwQU8ls",
    externalRating: {
      source: "Rotten Tomatoes",
      value: "95%"
    },
    sourceIds: {
      tmdb: "11423"
    }
  },
  {
    id: "movie_past_lives",
    slug: slugify("Past Lives"),
    title: "Past Lives",
    year: 2023,
    synopsis:
      "Dos amigos de la infancia vuelven a encontrarse en la adultez y se preguntan qué habría ocurrido si sus vidas no hubieran tomado rumbos tan distintos.",
    durationMinutes: 106,
    genres: ["Drama", "Romance"],
    director: "Celine Song",
    cast: ["Greta Lee", "Teo Yoo", "John Magaro"],
    language: "Inglés",
    country: "Estados Unidos",
    trailerUrl: "https://www.youtube.com/watch?v=kA244xewjcI",
    externalRating: {
      source: "Rotten Tomatoes",
      value: "95%"
    },
    sourceIds: {
      tmdb: "666277"
    }
  },
  {
    id: "movie_seven_samurai",
    slug: slugify("Seven Samurai"),
    title: "Seven Samurai",
    year: 1954,
    synopsis:
      "En un Japón feudal asolado por bandidos, una aldea contrata a siete samuráis sin amo para organizar su defensa y redefinir la relación entre heroísmo y sacrificio.",
    durationMinutes: 207,
    genres: ["Aventura", "Drama", "Acción"],
    director: "Akira Kurosawa",
    cast: ["Toshiro Mifune", "Takashi Shimura", "Keiko Tsushima"],
    language: "Japonés",
    country: "Japón",
    trailerUrl: "https://www.youtube.com/watch?v=wJ1TOratCTo",
    externalRating: {
      source: "Rotten Tomatoes",
      value: "100%"
    },
    sourceIds: {
      tmdb: "346"
    }
  },
  {
    id: "movie_la_haine",
    slug: slugify("La Haine"),
    title: "La Haine",
    year: 1995,
    synopsis:
      "Durante un día tenso tras unos disturbios en la periferia parisina, tres amigos recorren una ciudad hostil que parece precipitarse hacia una violencia inevitable.",
    durationMinutes: 98,
    genres: ["Drama", "Crimen"],
    director: "Mathieu Kassovitz",
    cast: ["Vincent Cassel", "Hubert Kounde", "Said Taghmaoui"],
    language: "Francés",
    country: "Francia",
    trailerUrl: "https://www.youtube.com/watch?v=FKwcXt3JIaU",
    externalRating: {
      source: "Rotten Tomatoes",
      value: "96%"
    },
    sourceIds: {
      tmdb: "406"
    }
  },
  {
    id: "movie_chungking_express",
    slug: slugify("Chungking Express"),
    title: "Chungking Express",
    year: 1994,
    synopsis:
      "Dos historias románticas y urbanas se cruzan en un Hong Kong de neones, fast food y soledad compartida, donde los encuentros casuales cambian el ritmo de la vida.",
    durationMinutes: 102,
    genres: ["Drama", "Romance", "Crimen"],
    director: "Wong Kar-wai",
    cast: ["Takeshi Kaneshiro", "Tony Leung", "Faye Wong"],
    language: "Cantonés",
    country: "Hong Kong",
    trailerUrl: "https://www.youtube.com/watch?v=OPCug9jyG9k",
    externalRating: {
      source: "Rotten Tomatoes",
      value: "88%"
    },
    sourceIds: {
      tmdb: "11104"
    }
  }
];

const initialWeek = startOfWeek(new Date("2026-03-14T12:00:00Z")).toISOString();

export const seedState: AppState = {
  users: [
    { id: "user_ismael", name: "Ismael", username: "Ismael", email: "ismael@cine.local", avatarSeed: "ismael", passwordHash: "" },
    { id: "user_clara", name: "Clara", username: "Clara", email: "clara@cine.local", avatarSeed: "clara", passwordHash: "" },
    { id: "user_dani", name: "Dani", username: "Dani", email: "dani@cine.local", avatarSeed: "dani", passwordHash: "" }
  ],
  group: {
    id: "group_cinefagos",
    name: "Los cinefagos del jueves",
    memberIds: ["user_ismael", "user_clara", "user_dani"],
    accentColor: "#d3542a"
  },
  movies,
  watchEntries: [
    {
      id: "watch_parasite",
      movieId: "movie_parasite",
      groupId: "group_cinefagos",
      watchedOn: "2026-02-08T20:30:00.000Z",
      selectedForWeek: "2026-W06"
    },
    {
      id: "watch_aftersun",
      movieId: "movie_aftersun",
      groupId: "group_cinefagos",
      watchedOn: "2026-02-16T21:00:00.000Z",
      selectedForWeek: "2026-W07"
    },
    {
      id: "watch_before_sunrise",
      movieId: "movie_before_sunrise",
      groupId: "group_cinefagos",
      watchedOn: "2026-02-23T21:15:00.000Z",
      selectedForWeek: "2026-W08"
    },
    {
      id: "watch_blade_runner_2049",
      movieId: "movie_blade_runner_2049",
      groupId: "group_cinefagos",
      watchedOn: "2026-03-02T21:00:00.000Z",
      selectedForWeek: "2026-W09"
    }
  ],
  ratings: [
    { id: "rating_1", movieId: "movie_parasite", userId: "user_ismael", score: 9.4, comment: "Sardonica y afiladisima." },
    { id: "rating_2", movieId: "movie_parasite", userId: "user_clara", score: 9.7, comment: "Control total del tono." },
    { id: "rating_3", movieId: "movie_parasite", userId: "user_dani", score: 9.1, comment: "Entradisima y contundente." },
    { id: "rating_4", movieId: "movie_aftersun", userId: "user_ismael", score: 8.8, comment: "Muy delicada." },
    { id: "rating_5", movieId: "movie_aftersun", userId: "user_clara", score: 9.2, comment: "Se te queda dentro." },
    { id: "rating_6", movieId: "movie_aftersun", userId: "user_dani", score: 8.1, comment: "Crecio con el poso." },
    { id: "rating_7", movieId: "movie_before_sunrise", userId: "user_ismael", score: 8.9, comment: "Conversacion pura." },
    { id: "rating_8", movieId: "movie_before_sunrise", userId: "user_clara", score: 9.5, comment: "Encanto total." },
    { id: "rating_9", movieId: "movie_before_sunrise", userId: "user_dani", score: 8.4, comment: "Muy viva." },
    { id: "rating_10", movieId: "movie_blade_runner_2049", userId: "user_ismael", score: 9.0, comment: "Visualmente enorme." },
    { id: "rating_11", movieId: "movie_blade_runner_2049", userId: "user_clara", score: 8.5, comment: "Menos fria de lo que parece." },
    { id: "rating_12", movieId: "movie_blade_runner_2049", userId: "user_dani", score: 8.7, comment: "Mucho ambiente." }
  ],
  pendingMovieIds: [],
  weeklyBatches: [
    {
      id: "batch_current",
      groupId: "group_cinefagos",
      weekOf: initialWeek,
      createdAt: "2026-03-10T18:30:00.000Z",
      selectedMovieId: "movie_arrival",
      items: [
        {
          id: "item_arrival",
          movieId: "movie_arrival",
          score: 93,
          summary: "La mezcla entre ciencia ficcion emotiva y Denis Villeneuve encaja muy bien con lo que mejor valorais.",
          reasons: [
            { label: "Afinidad", detail: "Villeneuve y la ciencia ficcion os suelen funcionar muy bien." },
            { label: "Duracion", detail: "116 minutos, muy viable para entre semana." },
            { label: "Valoracion externa", detail: "94% en Rotten Tomatoes." }
          ]
        },
        {
          id: "item_holdovers",
          movieId: "movie_the_holdovers",
          score: 89,
          summary: "Un cambio de tono hacia la comedia dramatica para no repetir otra semana tan solemne.",
          reasons: [
            { label: "Variedad", detail: "Aporta ligereza sin irse a algo menor." },
            { label: "Grupo", detail: "Vuestras medias altas en drama humano le favorecen." },
            { label: "Tiempo", detail: "133 minutos, asumible para plan de amigos." }
          ]
        },
        {
          id: "item_memories",
          movieId: "movie_memories_of_murder",
          score: 87,
          summary: "La buena respuesta a Parasite apunta a que Bong Joon-ho puede volver a funcionaros muy bien.",
          reasons: [
            { label: "Director", detail: "Bong Joon-ho ya tiene una media excelente en el grupo." },
            { label: "Genero", detail: "Thriller y drama estan entre vuestros mejores registros." },
            { label: "Nota externa", detail: "95% en Rotten Tomatoes." }
          ]
        }
      ]
    }
  ],
  activity: [
    {
      type: "recommended",
      label: "Se generó una nueva tanda semanal de recomendaciones",
      date: "2026-03-10T18:30:00.000Z"
    },
    {
      type: "watched",
      label: "Visteis Blade Runner 2049 en grupo",
      movieId: "movie_blade_runner_2049",
      date: "2026-03-02T21:00:00.000Z"
    },
    {
      type: "rated",
      label: "Clara puntuó Before Sunrise con un 9.5",
      movieId: "movie_before_sunrise",
      userId: "user_clara",
      date: "2026-02-24T09:00:00.000Z"
    }
  ]
};
