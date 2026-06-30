import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aruviah",
    short_name: "Aruviah",
    description:
      "Discover hundreds of products flowing past you — electronics, home, beauty, fashion, and more.",
    start_url: "/",
    display: "standalone",
    background_color: "#F7F8F6",
    theme_color: "#1F8A70",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
