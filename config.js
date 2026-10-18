// No Apps Script required. Direct Google Sheets polling, with GitHub Actions as a hyperlink fallback.
window.WALLHOPS_CONFIG = {
  spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1IL_rmiXINST07Hb04RX3qpfQ2pM98FBqnxWwN4Xt7o0/edit',
  dataUrl: './data/rankings.json',
  pcSheetName: 'Top PC Wallhops',
  mobileSheetName: 'Top Mobile Wallhops',
  refreshMs: 30000,
  discordUrl: 'https://discord.gg/HzYYkAqJ6C' // Optional: Set a real Discord invite URL to show the Discord tab.
};
