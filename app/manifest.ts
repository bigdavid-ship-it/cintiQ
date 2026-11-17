import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "cintiQ – Your Campus. Your Marketplace.",
    short_name: "cintiQ",
    description: "Buy and sell with verified student entrepreneurs and local businesses around your university.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf7",
    theme_color: "#0e5c63",
    orientation: "portrait",
    icons: [
      {
        src: "/cintiq-logo.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/cintiq-logo.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
