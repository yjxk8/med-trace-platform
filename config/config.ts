// https://umijs.org/config/
import { join } from 'node:path';
import { defineConfig } from '@umijs/max';
import { routes } from '../src/config/routes';
import defaultSettings from './defaultSettings';
import proxy from './proxy';

const { UMI_ENV = 'dev' } = process.env;

// Compute commit hash: env vars take precedence, fall back to git at build time
const commitHash =
  process.env.COMMIT_HASH ||
  process.env.CF_PAGES_COMMIT_SHA ||
  (() => {
    try {
      return require('node:child_process')
        .execSync('git rev-parse HEAD', {
          stdio: ['ignore', 'pipe', 'ignore'],
          encoding: 'utf-8',
        })
        .trim();
    } catch {
      return '';
    }
  })();

/**
 * @name 使用公共路径
 * @description 部署时的路径，如果部署在非根目录下，需要配置这个变量
 * @doc https://umijs.org/docs/api/config#publicpath
 */
const PUBLIC_PATH: string = '/';

export default defineConfig({
  // 路由：唯一来源 src/config/routes.ts（业务代码通过 @/config/routes 共享同一份数据）
  routes,

  // 代理：读 config/proxy.ts，按环境取 dev / test / pre
  proxy: proxy[UMI_ENV as keyof typeof proxy],

  alias: {
    '@root': join(__dirname, '..'),
  },

  /**
   * @name 开启 hash 模式
   * @description 让 build 之后的产物包含 hash 后缀，用于增量发布和避免浏览器缓存
   * @doc https://umijs.org/docs/api/config#hash
   */
  hash: true,
  publicPath: PUBLIC_PATH,

  // 国际化无要求时减少 js 包大小
  ignoreMomentLocale: true,

  // 快速热更新（保留 state）
  fastRefresh: true,

  // 路由预加载 + manifest
  routePrefetch: {},
  manifest: {},

  //============== max 插件配置 ===============

  /** @name 数据流插件 @doc https://umijs.org/docs/max/data-flow */
  model: {},

  /**
   * 全局初始数据流（存放 token / currentUser 等）
   * @doc https://umijs.org/docs/max/data-flow
   */
  initialState: {},

  /**
   * @name layout 插件
   * @doc https://umijs.org/docs/max/layout-menu
   */
  title: '毒麻精药品追溯管理平台',
  layout: {
    locale: false,
    ...defaultSettings,
    // 确保标题不被 defaultSettings 里的默认值覆盖
    title: '毒麻精药品追溯管理平台',
  },

  // moment2dayjs
  moment2dayjs: {
    preset: 'antd',
    plugins: ['duration', 'relativeTime'],
  },

  /**
   * @name 国际化插件
   * @doc https://umijs.org/docs/max/i18n
   */
  locale: {
    default: 'zh-CN',
    antd: true,
    baseNavigator: true,
  },

  /**
   * @name antd 插件
   * @doc https://umijs.org/docs/max/antd#antd
   */
  antd: {
    appConfig: {},
    configProvider: {
      variant: 'filled',
      theme: {
        token: {
          fontFamily: 'AlibabaSans, sans-serif',
        },
      },
    },
  },

  /** @name 网络请求 @doc https://umijs.org/docs/max/request */
  request: {},

  /** @name React Query @doc https://umijs.org/docs/max/react-query */
  reactQuery: {},

  /** @name 权限插件 @doc https://umijs.org/docs/max/access */
  access: {},

  /** @name Google Analytics */
  analytics: {
    ga_v2: 'G-59NF1VHHPF',
  },

  /** @name <head> 额外 script（解决首屏白屏） */
  headScripts: [{ src: join(PUBLIC_PATH, 'scripts/loading.js'), async: true }],

  //================ pro 插件配置 =================
  plugins: ['@umijs/max-plugin-openapi', '@umijs/request-record'],

  /**
   * @name openAPI 插件
   * @doc https://pro.ant.design/zh-cn/docs/openapi/
   */
  openAPI: [
    {
      requestLibPath: "import { request } from '@umijs/max'",
      schemaPath: join(__dirname, 'oneapi.json'),
      mock: false,
    },
  ],

  tailwindcss: {},

  mock: {
    include: ['src/pages/**/_mock.ts'],
    exclude: ['mock/requestRecord.mock.js'],
  },

  utoopack: {
    module: {
      rules: {
        '*.md': {
          loaders: [{ loader: join(__dirname, 'md-raw-loader.cjs') }],
          as: '*.js',
        },
      },
    },
  },

  requestRecord: {},

  define: {
    'process.env.CI': process.env.CI,
    'process.env.COMMIT_HASH': commitHash,
    __APP_VERSION__: require('../package.json').version,
    __UMI_VERSION__: require('@umijs/max/package.json').version,
    __UTOO_VERSION__: require('@utoo/pack/package.json').version,
  },
});
