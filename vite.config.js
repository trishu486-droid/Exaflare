import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 公開サイト（GitHub Pages）は dist/ に通常のビルド。
// アーティファクト用は --mode artifact で、JS と CSS を index.html 1枚にまとめる（画像は別ファイルのまま）。
export default defineConfig(({ mode }) => ({
  base: './',
  build: mode === 'artifact'
    ? { outDir: 'dist-artifact', copyPublicDir: false, assetsInlineLimit: (f) => f.endsWith('.woff2') } // フォントだけは1枚に埋め込む
    : { outDir: 'dist' },
  plugins: mode === 'artifact' ? [viteSingleFile({ removeViteModuleLoader: true })] : [],
}));
