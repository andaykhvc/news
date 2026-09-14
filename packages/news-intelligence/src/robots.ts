function octets(value: string) {
  return value
    .replace(/%([0-9a-f]{2})/gi, (whole: string, hex: string) => {
      const c = String.fromCharCode(parseInt(hex, 16));
      return /[a-z0-9_~.-]/i.test(c) ? c : whole.toUpperCase();
    })
    .replace(/[^\x21-\x7e]/gu, (c) => encodeURIComponent(c));
}
export function robotsPolicy(
  body: string,
  url: string,
  agent = 'SakHaberBot',
): { allowed: boolean; delayMs: number } {
  const groups: {
    agents: string[];
    rules: { allow: boolean; path: string }[];
    delay: number;
  }[] = [];
  let group: (typeof groups)[number] | undefined;
  let rulesStarted = false;
  for (const line of body.split(/\r?\n/)) {
    const clean = line.split('#')[0]!.trim();
    const colon = clean.indexOf(':');
    if (colon < 0) continue;
    const key = clean.slice(0, colon).trim().toLowerCase(),
      value = clean.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!group || rulesStarted) {
        group = { agents: [], rules: [], delay: 0 };
        groups.push(group);
        rulesStarted = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group && ['allow', 'disallow', 'crawl-delay'].includes(key)) {
      rulesStarted = true;
      if (key === 'crawl-delay') {
        const delay = Number(value);
        if (Number.isFinite(delay) && delay >= 0)
          group.delay = Math.max(group.delay, delay * 1000);
      } else if (value)
        group.rules.push({ allow: key === 'allow', path: octets(value) });
    }
  }
  const exact = groups.filter((g) => g.agents.includes(agent.toLowerCase()));
  const selected = exact.length
    ? exact
    : groups.filter((g) => g.agents.includes('*'));
  const target = new URL(url),
    path = octets(target.pathname + target.search);
  let longest = -1,
    allowed = true;
  for (const rule of selected.flatMap((g) => g.rules)) {
    const regex =
      '^' +
      rule.path
        .split('*')
        .map((p) => p.replace(/[.+?^{}()|[\]\\]/g, '\\$&'))
        .join('.*')
        .replace(/\$$/, '$');
    if (new RegExp(regex).test(path)) {
      const size = rule.path.replace(/[*$]/g, '').length;
      if (size > longest || (size === longest && rule.allow)) {
        longest = size;
        allowed = rule.allow;
      }
    }
  }
  return { allowed, delayMs: Math.max(0, ...selected.map((g) => g.delay)) };
}
