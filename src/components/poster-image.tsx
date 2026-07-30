type PosterImageProps = {
  src?: string;
  className?: string;
  loading?: "eager" | "lazy";
};

export function PosterImage({ src, className = "", loading = "lazy" }: PosterImageProps) {
  if (!src) {
    return null;
  }

  const classes = ["poster-image", className].filter(Boolean).join(" ");

  return (
    // These are decorative TMDb assets; native images avoid image-optimizer quota and support real lazy loading.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={classes}
      loading={loading}
      decoding="async"
      fetchPriority={loading === "eager" ? "high" : "low"}
    />
  );
}
