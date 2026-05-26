const { Tray, Menu, app, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

function ensureIconExists() {
  const iconPath = path.join(app.getAppPath(), "build", "tray-icon.png");

  // Check if file exists and is a reasonable size (valid PNG, not corrupted)
  if (fs.existsSync(iconPath)) {
    const stat = fs.statSync(iconPath);
    if (stat.size > 100 && stat.size < 500000) return iconPath;
    // File too large or too small — likely corrupt, regenerate
    try { fs.unlinkSync(iconPath); } catch (_) {}
  }

  // Generate icon programmatically
  try {
    const pngjs = require("pngjs");
    const size = 256;
    const png = new pngjs.PNG({ width: size, height: size });

    // Draw rounded-square icon with book accent
    const cx = size / 2, cy = size / 2;
    const outerR = size / 2 - 4;
    const innerR = outerR - 4;

    function setPx(x, y, r, g, b, a) {
      const idx = (y * size + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }

    function dist(ax, ay, bx, by) {
      return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Rounded square: use Chebyshev distance with corner rounding
        const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
        const d = Math.max(dx, dy);
        const cornerR = 48;

        if (d < outerR - cornerR) {
          // Inside: dark bg
          setPx(x, y, 26, 26, 46, 255);
        } else if (d < outerR) {
          // Rounded corner area
          const edgeD = dist(
            Math.max(Math.abs(x - cx), cornerR),
            Math.max(Math.abs(y - cy), cornerR),
            cornerR, cornerR
          );
          if (edgeD < cornerR) {
            setPx(x, y, 26, 26, 46, 255);
          } else if (edgeD < cornerR + 2) {
            const alpha = Math.round(255 * (1 - (edgeD - cornerR) / 2));
            setPx(x, y, 26, 26, 46, alpha);
          } else {
            setPx(x, y, 0, 0, 0, 0);
          }
        } else {
          setPx(x, y, 0, 0, 0, 0);
        }
      }
    }

    // Draw open book shape
    const bookLeft = cx - 40, bookRight = cx + 40;
    const bookTop = cy - 30, bookBottom = cy + 30;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) << 2;
        if (png.data[idx + 3] === 0) continue;

        // Book spine (center line)
        if (Math.abs(x - cx) < 3 && y > bookTop + 8 && y < bookBottom) {
          setPx(x, y, 233, 69, 96, 255);
          continue;
        }

        // Book pages (left and right halves)
        const inBookX = x >= bookLeft && x <= bookRight;
        const inBookY = y >= bookTop && y <= bookBottom;
        if (!inBookX || !inBookY) continue;

        // Left page
        if (x < cx) {
          const pageX = cx - x;
          const maxW = cx - bookLeft;
          const fade = 1 - pageX / maxW;
          const r = Math.round(233 - fade * 80);
          const g = Math.round(69 + fade * 60);
          const b = Math.round(96 + fade * 80);
          setPx(x, y, r, g, b, 200);
        }
        // Right page
        if (x > cx) {
          const pageX = x - cx;
          const maxW = bookRight - cx;
          const fade = 1 - pageX / maxW;
          const r = Math.round(233 - fade * 80);
          const g = Math.round(69 + fade * 60);
          const b = Math.round(96 + fade * 80);
          setPx(x, y, r, g, b, 200);
        }
      }
    }

    const buf = pngjs.PNG.sync.write(png);
    fs.writeFileSync(iconPath, buf);
  } catch (_) {
    // If generation fails, create a minimal fallback
    try {
      const pngjs = require("pngjs");
      const size = 32;
      const png = new pngjs.PNG({ width: size, height: size });
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = (y * size + x) << 2;
          const cx2 = x - size / 2, cy2 = y - size / 2;
          if (Math.max(Math.abs(cx2), Math.abs(cy2)) < size / 2 - 2) {
            png.data[idx] = 0x1a; png.data[idx + 1] = 0x1a;
            png.data[idx + 2] = 0x2e; png.data[idx + 3] = 255;
          } else {
            png.data[idx + 3] = 0;
          }
        }
      }
      const buf = pngjs.PNG.sync.write(png);
      fs.writeFileSync(iconPath, buf);
    } catch (_) {}
  }

  return iconPath;
}

function createTray(sessionManager) {
  const iconPath = ensureIconExists();
  let tray;

  try {
    const icon = nativeImage.createFromPath(iconPath);
    tray = icon.isEmpty() ? new Tray(nativeImage.createEmpty()) : new Tray(icon);
  } catch (_) {
    tray = new Tray(nativeImage.createEmpty());
  }

  const updateMenu = () => {
    const status = sessionManager.getStatus();
    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: status.running ? "暂停阅读" : "启动阅读",
        click: async () => {
          if (status.running) {
            await sessionManager.stop();
          } else {
            await sessionManager.start();
          }
          updateMenu();
        },
      },
      { label: "打开主窗口", click: () => require("../windows/mainWindow").showMainWindow() },
      { type: "separator" },
      { label: "退出", click: () => { app.isQuitting = true; app.quit(); } },
    ]));
  };

  updateMenu();
  tray.on("click", () => {
    require("../windows/mainWindow").showMainWindow();
  });
  sessionManager.on("update", () => updateMenu());
  return tray;
}

module.exports = { createTray };
