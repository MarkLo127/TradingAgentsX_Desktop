import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist-electron', 'release', 'resources']),

  // 渲染行程
  {
    files: ['src/**/*.{ts,tsx}', 'shared/**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },

  // Context 檔案同時匯出 Provider 元件與對應的 hook，這是刻意的：
  // 拆成兩個檔案只為了 fast refresh 的粒度，不值得。
  {
    files: ['src/lib/store.tsx', 'src/lib/theme.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // 主行程 / preload：Node 環境，沒有 React
  {
    files: ['electron/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
])
