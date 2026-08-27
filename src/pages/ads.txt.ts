// ABOUTME: Serves /ads.txt declaring Google as authorized ad seller.
// ABOUTME: Empty until PUBLIC_ADSENSE_CLIENT is set at build time.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  const client = import.meta.env.PUBLIC_ADSENSE_CLIENT as string | undefined;
  const publisher = client?.replace(/^ca-/, "");
  const body = publisher
    ? `google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`
    : "";
  return new Response(body, { headers: { "Content-Type": "text/plain" } });
};
