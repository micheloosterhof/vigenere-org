// ABOUTME: End-to-end smoke tests: every page renders, the tools compute, and deep links auto-run.
// ABOUTME: Deep-link vectors match the unit-test vectors (Kryptos K1, Vigenère LEMON).
// SPDX-FileCopyrightText: 2026 Michel Oosterhof
// SPDX-License-Identifier: BSD-3-Clause
import { expect, test } from "@playwright/test";

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
    `/autokey/?text=${encodeURIComponent(plaintext)}&key=QUEEN&variant=plaintext&mode=encrypt`,
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
    "primer length 5",
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

test("the kryptos page decrypts K1 with one click", async ({ page }) => {
  await page.goto("/kryptos/");
  await page.getByRole("link", { name: /Decrypt K1/ }).click();
  await expect(page.locator("[data-quagmire] [data-output]")).toHaveValue(
    "BETWEENSUBTLESHADINGANDTHEABSENCEOFLIGHTLIESTHENUANCEOFIQLUSION",
  );
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
