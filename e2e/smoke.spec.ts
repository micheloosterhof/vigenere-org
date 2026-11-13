// ABOUTME: End-to-end smoke tests: every page renders, the tools compute, and deep links auto-run.
// ABOUTME: Deep-link vectors match the unit-test vectors; word splitting is off except where a test turns it on.
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Most tests compare exact plaintexts, so they run with the word splitter off;
// the tests of the splitter itself clear this before loading the page.
const SPLIT_KEY = "vigenere.org:split-words";
test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem("keep-split")) {
      localStorage.setItem(key, "off");
    }
  }, SPLIT_KEY);
});

const pages: [string, string][] = [
  ["/", "secret message"],
  ["/vigenere/", "Vigenère cipher"],
  ["/beaufort/", "Beaufort cipher"],
  ["/caesar/", "Caesar cipher"],
  ["/rot13/", "ROT13"],
  ["/atbash/", "Atbash cipher"],
  ["/autokey/", "Autokey cipher"],
  ["/quagmire/", "Quagmire ciphers"],
  ["/playfair/", "Playfair cipher"],
  ["/substitution/", "Substitution cipher"],
  ["/railfence/", "Rail fence cipher"],
  ["/transposition/", "Columnar transposition cipher"],
  ["/polyalphabetic/", "Polyalphabetic cipher solver"],
  ["/affine/", "Affine cipher"],
  ["/gronsfeld/", "Gronsfeld cipher"],
  ["/porta/", "Porta cipher"],
  ["/bifid/", "Bifid cipher"],
  ["/trifid/", "Trifid cipher"],
  ["/double-transposition/", "Double transposition cipher"],
  ["/route/", "Route cipher"],
  ["/analyze/", "What cipher is this?"],
  ["/kryptos/", "The Kryptos sculpture"],
  ["/privacy/", "Privacy policy"],
];

for (const [path, heading] of pages) {
  test(`${path} renders`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("h1")).toContainText(heading);
  });
}

test("unknown URLs get the 404 page", async ({ page }) => {
  const response = await page.goto("/no-such-page/");
  expect(response?.status()).toBe(404);
  await expect(page.locator("h1")).toContainText("Page not found");
});

const adScript = 'script[src*="pagead2.googlesyndication.com"]';

test("tool pages carry the AdSense script", async ({ page }) => {
  await page.goto("/vigenere/");
  expect(await page.locator(adScript).count()).toBeGreaterThan(0);
});

test("the privacy and 404 pages carry no ad code", async ({ page }) => {
  await page.goto("/privacy/");
  await expect(page.locator(adScript)).toHaveCount(0);
  await page.goto("/no-such-page/");
  await expect(page.locator(adScript)).toHaveCount(0);
});

test("vigenère form encrypts ATTACKATDAWN with LEMON", async ({ page }) => {
  await page.goto("/vigenere/");
  const tool = page.locator("[data-cipher=vigenere]");
  await tool.locator("[data-input]").fill("ATTACKATDAWN");
  await tool.locator("[data-key]").fill("LEMON");
  await tool.locator("[data-encrypt]").click();
  await expect(tool.locator("[data-output]")).toHaveValue("LXFOPVEFRNHR");
});

test("caesar breaker recovers shift 3", async ({ page }) => {
  await page.goto("/caesar/");
  const breaker = page.locator("[data-breaker=caesar]");
  await breaker
    .locator("[data-input]")
    .fill("WKLV LV D VHFUHW PHVVDJH WR YHULIB WKH VROYHU");
  await breaker.locator("[data-solve]").click();
  await expect(breaker.locator("[data-summary]")).toContainText(
    "Best shift: 3",
  );
});

test("autokey page encrypts and its breaker recovers the plaintext", async ({
  page,
}) => {
  const plaintext =
    "IT WAS A BRIGHT COLD DAY IN APRIL AND THE CLOCKS WERE STRIKING " +
    "THIRTEEN WINSTON SMITH SLIPPED QUICKLY THROUGH THE GLASS DOORS";
  await page.goto(
    `/autokey/?text=${encodeURIComponent(plaintext)}&key=QUEEN&variant=plaintext&tableau=beaufort&mode=encrypt`,
  );
  const tool = page.locator("[data-autokey]");
  const ciphertext = await tool.locator("[data-output]").inputValue();
  expect(ciphertext).not.toBe("");
  expect(ciphertext).not.toBe(plaintext);

  const breaker = page.locator("[data-autokey-breaker]");
  await breaker.locator("[data-input]").fill(ciphertext);
  await breaker.locator("[data-solve]").click();
  await expect(breaker.locator("[data-output]")).toHaveValue(plaintext, {
    timeout: 30_000,
  });
  await expect(breaker.locator("[data-summary]")).toContainText(
    "Beaufort tableau, primer length 5",
  );
});

test("deep link decrypts on the vigenère page", async ({ page }) => {
  await page.goto("/vigenere/?text=LXFOPVEFRNHR&key=LEMON&mode=decrypt");
  await expect(
    page.locator("[data-cipher=vigenere] [data-output]"),
  ).toHaveValue("ATTACKATDAWN");
});

test("deep link decrypts on the caesar page", async ({ page }) => {
  await page.goto("/caesar/?text=Khoor&shift=3&mode=decrypt");
  await expect(page.locator("[data-cipher=caesar] [data-output]")).toHaveValue(
    "Hello",
  );
});

test("deep link decrypts on the rail fence page", async ({ page }) => {
  await page.goto(
    "/railfence/?text=WECRLTEERDSOEEFEAOCAIVDEN&rails=3&mode=decrypt",
  );
  await expect(
    page.locator("[data-cipher=railfence] [data-output]"),
  ).toHaveValue("WEAREDISCOVEREDFLEEATONCE");
});

test("deep link encrypts on the playfair page", async ({ page }) => {
  await page.goto(
    "/playfair/?text=Hide%20the%20gold%20in%20the%20tree%20stump&key=playfair%20example&mode=encrypt",
  );
  await expect(
    page.locator("[data-cipher=playfair] [data-output]"),
  ).toHaveValue("BMODZBXDNABEKUDMUIXMMOUVIF");
});

test("deep link decrypts on the transposition page", async ({ page }) => {
  await page.goto(
    "/transposition/?text=EVLNACDTESEAROFODEECWIREE&key=ZEBRAS&mode=decrypt",
  );
  await expect(
    page.locator("[data-cipher=columnar] [data-output]"),
  ).toHaveValue("WEAREDISCOVEREDFLEEATONCE");
});

test("deep link decodes on the rot13 page", async ({ page }) => {
  await page.goto("/rot13/?text=Uryyb");
  await expect(page.locator("[data-cipher=rot13] [data-output]")).toHaveValue(
    "Hello",
  );
});

test("deep link runs the beaufort page", async ({ page }) => {
  await page.goto("/beaufort/?text=HELLO&key=SECRET");
  await expect(
    page.locator("[data-cipher=beaufort] [data-output]"),
  ).toHaveValue("LARGQ");
});

test("deep link decrypts Kryptos K1 on the quagmire page", async ({ page }) => {
  const k1 = "EMUFPHZLRFAXYUSDJKZLDKRNSHGNFIVJYQTQUXQBQVYUVLLTREVJYQTMKYRDMFD";
  await page.goto(
    `/quagmire/?text=${k1}&variant=3&keyword=KRYPTOS&key=PALIMPSEST&indicator=K&mode=decrypt`,
  );
  await expect(page.locator("[data-quagmire] [data-output]")).toHaveValue(
    "BETWEENSUBTLESHADINGANDTHEABSENCEOFLIGHTLIESTHENUANCEOFIQLUSION",
  );
});

for (const variant of ["1", "3"]) {
  test(`the quagmire breaker finds a dictionary keyword (variant ${variant})`, async ({
    page,
  }) => {
    const plaintext =
      "IT WAS A BRIGHT COLD DAY IN APRIL AND THE CLOCKS WERE STRIKING " +
      "THIRTEEN WINSTON SMITH SLIPPED QUICKLY THROUGH THE GLASS DOORS";
    await page.goto(
      `/quagmire/?text=${encodeURIComponent(plaintext)}&variant=${variant}&keyword=SPRING&key=TALE&indicator=A&mode=encrypt`,
    );
    const ciphertext = await page
      .locator("[data-quagmire] [data-output]")
      .inputValue();
    expect(ciphertext).not.toBe(plaintext);

    const breaker = page.locator("[data-quagmire-breaker]");
    await breaker.locator("[data-input]").fill(ciphertext);
    await breaker.locator("[data-solve]").click();
    await expect(breaker.locator("[data-summary]")).toContainText(
      `Quagmire ${variant === "1" ? "I" : "III"}: keyword SPRING found in the dictionary; key TALE`,
      { timeout: 60_000 },
    );
    await expect(breaker.locator("[data-output]")).toHaveValue(plaintext);
  });
}

test("the kryptos page decrypts K1 with one click", async ({ page }) => {
  await page.goto("/kryptos/");
  await page.getByRole("link", { name: /Decrypt K1/ }).click();
  await expect(page.locator("[data-quagmire] [data-output]")).toHaveValue(
    "BETWEENSUBTLESHADINGANDTHEABSENCEOFLIGHTLIESTHENUANCEOFIQLUSION",
  );
});

test("editing the vigenère form keeps the URL a shareable deep link", async ({
  page,
}) => {
  await page.goto("/vigenere/");
  const tool = page.locator("[data-cipher=vigenere]");
  await tool.locator("[data-input]").fill("LXFOPVEFRNHR");
  await tool.locator("[data-key]").fill("LEMON");
  await tool.locator("[data-decrypt]").click();
  await expect(page).toHaveURL(
    "/vigenere/?text=LXFOPVEFRNHR&key=LEMON&mode=decrypt",
  );
  await page.reload();
  await expect(tool.locator("[data-output]")).toHaveValue("ATTACKATDAWN");
});

test("editing the caesar form mirrors the shift into the URL", async ({
  page,
}) => {
  await page.goto("/caesar/");
  const tool = page.locator("[data-cipher=caesar]");
  await tool.locator("[data-input]").fill("Khoor");
  await tool.locator("[data-key]").fill("3");
  await tool.locator("[data-decrypt]").click();
  await expect(page).toHaveURL("/caesar/?text=Khoor&shift=3&mode=decrypt");
  await page.reload();
  await expect(tool.locator("[data-output]")).toHaveValue("Hello");
});

test("editing the quagmire form mirrors its settings into the URL", async ({
  page,
}) => {
  await page.goto("/quagmire/");
  const tool = page.locator("[data-quagmire]");
  await tool.locator("[data-input]").fill("HELLO");
  await tool.locator("[data-keyword]").fill("KRYPTOS");
  await tool.locator("[data-key]").fill("PALIMPSEST");
  await tool.locator("[data-encrypt]").click();
  await expect(page).toHaveURL(
    "/quagmire/?text=HELLO&variant=3&keyword=KRYPTOS&key=PALIMPSEST&indicator=A",
  );
  const ciphertext = await tool.locator("[data-output]").inputValue();
  expect(ciphertext).not.toBe("");
  await page.reload();
  await expect(tool.locator("[data-output]")).toHaveValue(ciphertext);
});

test("editing the autokey form mirrors its settings into the URL", async ({
  page,
}) => {
  await page.goto("/autokey/");
  const tool = page.locator("[data-autokey]");
  await tool.locator("[data-input]").fill("HELLO");
  await tool.locator("[data-key]").fill("QUEEN");
  await tool.locator("[data-encrypt]").click();
  await expect(page).toHaveURL(
    "/autokey/?text=HELLO&key=QUEEN&variant=plaintext",
  );
  const ciphertext = await tool.locator("[data-output]").inputValue();
  expect(ciphertext).not.toBe("");
  await page.reload();
  await expect(tool.locator("[data-output]")).toHaveValue(ciphertext);
});

test("autokey deep link selects the tableau and the form mirrors it", async ({
  page,
}) => {
  await page.goto(
    "/autokey/?text=NOTIFYQUARTERMASTER&key=X&variant=plaintext&tableau=beaufort",
  );
  const tool = page.locator("[data-autokey]");
  await expect(tool.locator("[data-output]")).toHaveValue(
    "KZVLDHIWUJYPNFMIZPN",
  );
  await tool.locator("[data-tableau]").selectOption("variant-beaufort");
  await tool.locator("[data-encrypt]").click();
  await expect(tool.locator("[data-output]")).toHaveValue(
    "QBFPXTSEGRCLNVOSBLN",
  );
  await expect(page).toHaveURL(
    "/autokey/?text=NOTIFYQUARTERMASTER&key=X&variant=plaintext&tableau=variant-beaufort",
  );
});

test("typing on the analyze page mirrors the text into the URL", async ({
  page,
}) => {
  await page.goto("/analyze/");
  await page.locator("[data-analyzer] [data-input]").fill("WKLVLVDVHFUHW");
  await expect(page).toHaveURL("/analyze/?text=WKLVLVDVHFUHW");
});

// A Vigenère under FRUGAL; the breaker recovers the key on its own.
const FRUGAL_CIPHERTEXT =
  "GLSTOEBYUZYZZTUTUDJSOZWSFKSUUNFEHUTOTNCZHZZKQNAEDFOJOYTKHKEONJXKACFKUTYAWZWKCLYF";

test("the vigenère breaker mirrors its ciphertext into the URL and the link reruns it", async ({
  page,
}) => {
  await page.goto("/vigenere/");
  const breaker = page.locator("[data-breaker=vigenere]");
  await breaker.locator("[data-input]").fill(FRUGAL_CIPHERTEXT);
  await expect(page).toHaveURL(
    `/vigenere/?text=${FRUGAL_CIPHERTEXT}&mode=break`,
  );
  await breaker.locator("[data-solve]").click();
  await expect(breaker.locator("[data-summary]")).toContainText(
    "Recovered key: FRUGAL",
  );
  await page.reload();
  await expect(breaker.locator("[data-summary]")).toContainText(
    "Recovered key: FRUGAL",
  );
  // The encrypt/decrypt form on the same page leaves a breaker link alone.
  await expect(page.locator("[data-cipher=vigenere] [data-input]")).toHaveValue(
    "",
  );
});

test("the home page solver mirrors its ciphertext into the URL and the link reruns it", async ({
  page,
}) => {
  await page.goto("/");
  const solver = page.locator("[data-lucky]");
  await solver.locator("[data-input]").fill(FRUGAL_CIPHERTEXT);
  await expect(page).toHaveURL(`/?text=${FRUGAL_CIPHERTEXT}&mode=break`);
  await page.reload();
  await expect(solver.locator("[data-summary]")).toContainText(
    "Vigenère cipher (FRUGAL)",
    { timeout: 30_000 },
  );
  // Each attempt links to its tool with the ciphertext and key filled in.
  const vigenereLink = solver.locator("[data-attempts] a", {
    hasText: "Vigenère",
  });
  await expect(vigenereLink).toHaveAttribute(
    "href",
    `/vigenere/?text=${FRUGAL_CIPHERTEXT}&key=FRUGAL&mode=decrypt`,
  );
  await vigenereLink.click();
  await expect(page.locator("[data-cipher=vigenere] [data-key]")).toHaveValue(
    "FRUGAL",
  );
  await expect(
    page.locator("[data-cipher=vigenere] [data-output]"),
  ).toHaveValue(/^BUYNOTWHAT/);
});

test("the polyalphabetic breaker carries its key length in the URL", async ({
  page,
}) => {
  await page.goto("/polyalphabetic/");
  const breaker = page.locator("[data-poly]");
  await breaker.locator("[data-input]").fill(FRUGAL_CIPHERTEXT);
  await breaker.locator("[data-period]").fill("6");
  await expect(page).toHaveURL(
    `/polyalphabetic/?text=${FRUGAL_CIPHERTEXT}&period=6&mode=break`,
  );
  await page.reload();
  await expect(breaker.locator("[data-period]")).toHaveValue("6");
});

// The unit tests' "Nineteen Eighty-Four" passage under three independent
// random alphabets: only the general polyalphabetic solver can break it.
const RANDOM_ALPHABETS_CIPHERTEXT =
  "WLGMDQHFDUVVCGTJAQATSMNBWKQTAVQMIXGIIDGKFERLBWODTBVQTBYMETXDTDVFIXZTVQVDRJKWISBZ" +
  "RXMJWIVFVDRQBKCXYTSMIEVYNSLVFMXCCZKLKKUDXMGWIJRKDONEJSWWJLXRVQFNBBKYVEUKQRDJFGBR" +
  "GMLTIYGBAHQTDDFIXYVNBBKTGVDEDCOTAMSFECQLNOFELMSYCXETBXGMUFDYLAJEXYYBFHETLESTSUCT" +
  "FICETVQVDZLKKVQXKGMRXZMTYGMHGDXMJCCOHCCKCSJGTJFQUHQYDQYGSKMSJGMWLQCGTFEBKAZFDVKF" +
  "VFGTMFCKYNSTSJGNSADRNTMRKMAOKMSYCIIMJYGVQMGMKTWLJKNDCLEJDDZNTACSKINSHNBDMMJEZGBK" +
  "LKMIQZMVSMGWAEYVEVCIKGMMHQTGMMQNBLMFFVAYDLMGWLKMVEMUAHKQCOPFEXYCIQMQTABBBCKATAVQ" +
  "TAXFHEVMQYEBKD";

test("the polyalphabetic breaker solves random alphabets across its worker pool", async ({
  page,
}) => {
  await page.goto("/polyalphabetic/");
  const breaker = page.locator("[data-poly]");
  await breaker.locator("[data-input]").fill(RANDOM_ALPHABETS_CIPHERTEXT);
  await breaker.locator("[data-solve]").click();
  await expect(breaker.locator("[data-summary]")).toContainText(
    "Key length 3",
    { timeout: 60_000 },
  );
  await expect(breaker.locator("[data-output]")).toHaveValue(
    /^ITWASABRIGHTCOLDDAYINAPRIL/,
  );
});

test("the home page solver reaches the polyalphabetic fallback from inside its worker", async ({
  page,
}) => {
  await page.goto("/");
  const solver = page.locator("[data-lucky]");
  await solver.locator("[data-input]").fill(RANDOM_ALPHABETS_CIPHERTEXT);
  await solver.locator("[data-solve]").click();
  await expect(solver.locator("[data-summary]")).toContainText(
    "Polyalphabetic cipher (period 3)",
    { timeout: 90_000 },
  );
  await expect(solver.locator("[data-output]")).toHaveValue(
    /^ITWASABRIGHTCOLDDAYINAPRIL/,
  );
});

test("the copy link button puts the current deep link on the clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/vigenere/");
  const tool = page.locator("[data-cipher=vigenere]");
  await tool.locator("[data-input]").fill("LXFOPVEFRNHR");
  await tool.locator("[data-key]").fill("LEMON");
  await tool.locator("[data-decrypt]").click();
  const share = tool.locator("[data-share-link]");
  await share.click();
  await expect(share).toHaveText("Link copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "http://127.0.0.1:4321/vigenere/?text=LXFOPVEFRNHR&key=LEMON&mode=decrypt",
  );
});

test("clearing the text clears the URL again", async ({ page }) => {
  await page.goto("/vigenere/");
  const tool = page.locator("[data-cipher=vigenere]");
  await tool.locator("[data-input]").fill("HELLO");
  await expect(page).toHaveURL("/vigenere/?text=HELLO");
  await tool.locator("[data-input]").fill("");
  await expect(page).toHaveURL("/vigenere/");
});

async function jsonLdBlocks(page: Page): Promise<Record<string, unknown>[]> {
  const scripts = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  return scripts.map((s) => JSON.parse(s) as Record<string, unknown>);
}

test("the home page declares the site name and no breadcrumb", async ({
  page,
}) => {
  await page.goto("/");
  const blocks = await jsonLdBlocks(page);
  expect(blocks.find((b) => b["@type"] === "WebSite")).toMatchObject({
    name: "vigenere.org",
    url: "https://vigenere.org/",
  });
  expect(blocks.find((b) => b["@type"] === "BreadcrumbList")).toBeUndefined();
});

test("tool pages carry a breadcrumb trail back to the home page", async ({
  page,
}) => {
  await page.goto("/vigenere/");
  const blocks = await jsonLdBlocks(page);
  expect(blocks.find((b) => b["@type"] === "WebSite")).toBeUndefined();
  expect(blocks.find((b) => b["@type"] === "BreadcrumbList")).toMatchObject({
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://vigenere.org/",
      },
      { "@type": "ListItem", position: 2, name: "Vigenère cipher" },
    ],
  });
});

test("deep link analyzes text on the analyze page", async ({ page }) => {
  await page.goto(
    "/analyze/?text=WKLV%20LV%20D%20VHFUHW%20PHVVDJH%20WR%20YHULIB%20WKH%20VROYHU",
  );
  await expect(page.locator("[data-analyzer] [data-summary]")).toContainText(
    "monoalphabetic",
  );
  await expect(page.locator("[data-analyzer] [data-chart] rect")).toHaveCount(
    26,
  );
});

test("decrypted text is split into words by default, and the toggle turns it off", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    sessionStorage.setItem("keep-split", "1");
    if (!localStorage.getItem("seeded")) {
      localStorage.removeItem(key);
      localStorage.setItem("seeded", "1");
    }
  }, SPLIT_KEY);
  await page.goto("/vigenere/?text=LXFOPVEFRNHR&key=LEMON&mode=decrypt");
  const tool = page.locator("[data-cipher=vigenere]");
  await expect(tool.locator("[data-output]")).toHaveValue("ATTACK AT DAWN");
  await tool.locator("[data-word-split]").uncheck();
  await expect(tool.locator("[data-output]")).toHaveValue("ATTACKATDAWN");

  // The choice is remembered and applies to every output.
  await page.goto("/vigenere/?text=LXFOPVEFRNHR&key=LEMON&mode=decrypt");
  await expect(tool.locator("[data-word-split]")).not.toBeChecked();
  await expect(tool.locator("[data-output]")).toHaveValue("ATTACKATDAWN");
});

test("results are announced to screen readers and errors are alerts", async ({
  page,
}) => {
  await page.goto("/caesar/?text=Khoor&shift=3&mode=decrypt");
  const tool = page.locator("[data-cipher=caesar]");
  await expect(tool.getByRole("status")).toHaveText("Result: Hello");
  await tool.locator("[data-key]").fill("99");
  await tool.locator("[data-decrypt]").click();
  await expect(tool.getByRole("alert")).toContainText("shift must be");
});

const newToolLinks: [string, string, string][] = [
  [
    "affine",
    "/affine/?text=AFFINE%20CIPHER&a=5&b=8&mode=encrypt",
    "IHHWVC SWFRCP",
  ],
  [
    "gronsfeld",
    "/gronsfeld/?text=Attack%20at%20dawn&key=31415&mode=encrypt",
    "Duxbhn bx efzo",
  ],
  [
    "porta",
    "/porta/?text=abcdefghijklmnopqrstuvwxyz&key=HELLO",
    "qquvyvvznqnnrihmbmamegefej",
  ],
  [
    "bifid",
    "/bifid/?text=UAEOLWRINS&key=BGWKZQPNDSIOAXEFCLUMTHYVR&period=0&mode=decrypt",
    "FLEEATONCE",
  ],
  [
    "trifid",
    "/trifid/?text=FMJFVOISSUFTFPUFEQQC&key=FELIX%20MARIE%20DELASTELLE&period=5&mode=decrypt",
    "AIDETOILECIELTAIDERA",
  ],
  [
    "double",
    "/double-transposition/?text=CAEENSOIAEDRLEFWEDREEVTOC&key=ZEBRAS&key2=STRIPE&mode=decrypt",
    "WEAREDISCOVEREDFLEEATONCE",
  ],
  [
    "route",
    "/route/?text=EJXCTEDECDAEWRIORFEONALEVSE&columns=9&fill=columns&route=spiral-cw-tr&mode=decrypt",
    "WEAREDISCOVEREDFLEEATONCEJX",
  ],
];

for (const [cipher, link, expected] of newToolLinks) {
  test(`deep link runs the ${cipher} tool`, async ({ page }) => {
    await page.goto(link);
    await expect(
      page.locator(`[data-cipher=${cipher}] [data-output]`),
    ).toHaveValue(expected);
  });
}

const ENGLISH =
  "IT WAS A BRIGHT COLD DAY IN APRIL AND THE CLOCKS WERE STRIKING " +
  "THIRTEEN WINSTON SMITH SLIPPED QUICKLY THROUGH THE GLASS DOORS";

for (const [cipher, path, keyQuery, expected] of [
  ["affine", "/affine/", "a=5&b=8&mode=encrypt", "Best key: a = 5, b = 8"],
  // Porta pairs key letters, so SUN comes back as SUM (M and N share a tableau).
  ["porta", "/porta/", "key=SUN", "Recovered key: SUM"],
  [
    "route",
    "/route/",
    "columns=10&fill=rows&route=spiral-ccw-br&mode=encrypt",
    "Best grid and route",
  ],
] as const) {
  test(`the ${cipher} breaker recovers the plaintext`, async ({ page }) => {
    await page.goto(`${path}?text=${encodeURIComponent(ENGLISH)}&${keyQuery}`);
    const ciphertext = await page
      .locator(`[data-cipher=${cipher}] [data-output]`)
      .inputValue();
    expect(ciphertext).not.toBe("");
    const breaker = page.locator(`[data-breaker=${cipher}]`);
    await breaker.locator("[data-input]").fill(ciphertext);
    await breaker.locator("[data-solve]").click();
    await expect(breaker.locator("[data-summary]")).toContainText(expected, {
      timeout: 30_000,
    });
    const recovered = await breaker.locator("[data-output]").inputValue();
    expect(recovered.replace(/[^A-Z]/g, "")).toContain(
      ENGLISH.replace(/[^A-Z]/g, ""),
    );
  });
}

test("cipher pages carry a visible FAQ and matching FAQPage JSON-LD", async ({
  page,
}) => {
  await page.goto("/porta/");
  const faq = page.locator("[data-faq]");
  await expect(faq.locator("h2")).toHaveText("Frequently asked questions");
  const data = JSON.parse(
    (await faq.locator('script[type="application/ld+json"]').textContent()) ??
      "{}",
  );
  expect(data["@type"]).toBe("FAQPage");
  const firstQuestion = await faq.locator("h3").first().textContent();
  expect(data.mainEntity[0].name).toBe(firstQuestion?.trim());
});

test("the grouped navigation opens a family menu", async ({ page }) => {
  await page.goto("/");
  const route = page.getByRole("link", { name: "Route", exact: true });
  await expect(route).toBeHidden();
  await page.getByText("Transposition ▾").click();
  await expect(route).toBeVisible();
  await expect(route).toHaveAttribute("href", "/route");
  // Opening another family closes the first.
  await page.getByText("Polygraphic ▾").click();
  await expect(route).toBeHidden();
  await expect(
    page.getByRole("link", { name: "Bifid", exact: true }),
  ).toBeVisible();

  // Unslashed links work as on GitHub Pages, keeping the query string.
  await page.getByRole("link", { name: "Bifid", exact: true }).click();
  await expect(page).toHaveURL(/\/bifid\/$/);
  await expect(page.locator("h1")).toContainText("Bifid cipher");
  await page.goto("/caesar?text=Khoor&shift=3&mode=decrypt");
  await expect(page).toHaveURL(/\/caesar\/\?text=Khoor/);
  await expect(page.locator("[data-cipher=caesar] [data-output]")).toHaveValue(
    "Hello",
  );
});

// The annealing breakers run in a pool of workers seeded from Math.random,
// so these use texts long enough that a few attempts always suffice.
const ORWELL =
  "ITWASABRIGHTCOLDDAYINAPRILANDTHECLOCKSWERESTRIKINGTHIRTEENWINSTONSMITH" +
  "HISCHINNUZZLEDINTOHISBREASTINANEFFORTTOESCAPETHEVILEWINDSLIPPEDQUICKLY" +
  "THROUGHTHEGLASSDOORSOFVICTORYMANSIONSTHOUGHNOTQUICKLYENOUGHTOPREVENTA" +
  "SWIRLOFGRITTYDUSTFROMENTERINGALONGWITHHIMTHEHALLWAYSMELTOFBOILEDCABBA" +
  "GEANDOLDRAGMATSATONEENDOFITACOLOUREDPOSTERTOOLARGEFORINDOORDISPLAYHAD" +
  "BEENTACKEDTOTHEWALL";

for (const [cipher, path, encryptQuery, breakFields, expected] of [
  [
    "bifid",
    "/bifid/",
    "key=SECRETKEYWORD&period=6&mode=encrypt",
    {},
    "period 6",
  ],
  [
    "trifid",
    "/trifid/",
    "key=SECRETKEYWORD&period=5&mode=encrypt",
    { period: "5" },
    "period 5",
  ],
  [
    "double",
    "/double-transposition/",
    "key=ZEBRA&key2=CIPHERS&mode=encrypt",
    { length1: "5", length2: "7" },
    "first key",
  ],
] as const) {
  test(`the ${cipher} breaker recovers the plaintext in a worker pool`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto(`${path}?text=${ORWELL}&${encryptQuery}`);
    const ciphertext = await page
      .locator(`[data-cipher=${cipher}] [data-output]`)
      .inputValue();
    expect(ciphertext).not.toBe(ORWELL);
    const breaker = page.locator(`[data-anneal-breaker=${cipher}]`);
    await breaker.locator("[data-input]").fill(ciphertext);
    for (const [name, value] of Object.entries(breakFields)) {
      await breaker.locator(`[data-field=${name}]`).fill(value);
    }
    await breaker.locator("[data-solve]").click();
    await expect(breaker.locator("[data-summary]")).toContainText(
      `Recovered: ${expected}`,
      { timeout: 170_000 },
    );
    const recovered = await breaker.locator("[data-output]").inputValue();
    let same = 0;
    for (let i = 0; i < ORWELL.length; i += 1) {
      if (recovered[i] === ORWELL[i]) {
        same += 1;
      }
    }
    expect(same / ORWELL.length).toBeGreaterThan(0.9);
  });
}

test("the stop button ends an annealing search and keeps the best attempt", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/bifid/");
  const breaker = page.locator("[data-anneal-breaker=bifid]");
  // Pseudo-random letters (no repeats to overfit) never read as English, so
  // the search runs until stopped.
  let seed = 12345;
  const noise = Array.from({ length: 200 }, () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return "ABCDEFGHIKLMNOPQRSTUVWXYZ"[seed % 25];
  }).join("");
  await breaker.locator("[data-input]").fill(noise);
  await breaker.locator("[data-solve]").click();
  await expect(breaker.locator("[data-stop]")).toBeVisible();
  // Let at least one attempt finish so there is a best attempt to keep.
  await expect(breaker.locator("[data-progress-text]")).toContainText(
    /[1-9]\d* of \d+ attempts finished/,
    { timeout: 60_000 },
  );
  await breaker.locator("[data-stop]").click();
  await expect(breaker.locator("[data-summary]")).toContainText(
    "No English decryption found",
  );
  await expect(breaker.locator("[data-solve]")).toBeEnabled();
  await expect(breaker.locator("[data-stop]")).toBeHidden();
});
