/**
 * PublicAPIs - 公共API发现器
 *
 * 整合 public-apis 仓库的API列表，提供搜索和发现功能
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * API 条目
 */
export interface PublicAPI {
  name: string;
  description: string;
  url: string;
  category: string;
  auth: string;       // 认证方式
  https: boolean;
  cors: string;       // CORS 支持
}

/**
 * 搜索选项
 */
export interface SearchOptions {
  category?: string;
  auth?: string;
  https?: boolean;
  cors?: string;
}

/**
 * PublicAPIs 类
 *
 * 提供公共API的搜索和发现能力
 */
export class PublicAPIs {
  private apis: PublicAPI[] = [];

  constructor() {
    this.initializeAPIs();
  }

  /**
   * 初始化内置 API 列表（热门 API）
   */
  private initializeAPIs(): void {
    this.apis = [
      // Weather
      { name: 'OpenWeatherMap', description: '天气数据', url: 'https://openweathermap.org/api', category: 'Weather', auth: 'apiKey', https: true, cors: 'yes' },
      { name: 'WeatherAPI', description: '天气预报', url: 'https://www.weatherapi.com/', category: 'Weather', auth: 'apiKey', https: true, cors: 'yes' },
      { name: 'Open-Meteo', description: '免费天气API', url: 'https://open-meteo.com/', category: 'Weather', auth: 'no', https: true, cors: 'yes' },

      // Finance
      { name: 'Alpha Vantage', description: '股票/外汇数据', url: 'https://www.alphavantage.co/', category: 'Finance', auth: 'apiKey', https: true, cors: 'yes' },
      { name: 'Yahoo Finance', description: '股票数据', url: 'https://financeapi.net/', category: 'Finance', auth: 'apiKey', https: true, cors: 'unknown' },
      { name: 'CoinGecko', description: '加密货币数据', url: 'https://www.coingecko.com/en/api', category: 'Cryptocurrency', auth: 'no', https: true, cors: 'yes' },

      // Cryptocurrency
      { name: 'CoinCap', description: '加密货币价格', url: 'https://coincap.io/', category: 'Cryptocurrency', auth: 'no', https: true, cors: 'yes' },
      { name: 'Binance', description: '加密货币交易', url: 'https://www.binance.com/api', category: 'Cryptocurrency', auth: 'apiKey', https: true, cors: 'yes' },

      // Machine Learning
      { name: 'OpenAI', description: 'GPT AI模型', url: 'https://openai.com/api/', category: 'Machine Learning', auth: 'apiKey', https: true, cors: 'yes' },
      { name: 'Hugging Face', description: 'NLP模型', url: 'https://huggingface.co/', category: 'Machine Learning', auth: 'apiKey', https: true, cors: 'yes' },
      { name: 'TensorFlow', description: '机器学习框架', url: 'https://www.tensorflow.org/', category: 'Machine Learning', auth: 'no', https: true, cors: 'unknown' },

      // Development
      { name: 'GitHub', description: '代码托管', url: 'https://docs.github.com/en/rest', category: 'Development', auth: 'apiKey', https: true, cors: 'yes' },
      { name: 'npm', description: 'npm注册表', url: 'https://registry.npmjs.org/', category: 'Development', auth: 'no', https: true, cors: 'yes' },
      { name: 'Docker Hub', description: '容器镜像', url: 'https://docs.docker.com/docker-hub/api/latest/', category: 'Development', auth: 'apiKey', https: true, cors: 'unknown' },

      // Anime
      { name: 'Jikan', description: '动漫API', url: 'https://jikan.moe/', category: 'Anime', auth: 'no', https: true, cors: 'yes' },
      { name: 'Kitsu', description: '动漫/漫画数据库', url: 'https://kitsu.io/', category: 'Anime', auth: 'apiKey', https: true, cors: 'yes' },

      // Games
      { name: 'RAWG', description: '游戏数据库', url: 'https://rawg.io/apidocs', category: 'Games', auth: 'apiKey', https: true, cors: 'yes' },
      { name: 'Steam', description: 'Steam游戏平台', url: 'https://steamapi.xpaw.me/', category: 'Games', auth: 'apiKey', https: true, cors: 'unknown' },

      // News
      { name: 'NewsAPI', description: '新闻聚合', url: 'https://newsapi.org/', category: 'News', auth: 'apiKey', https: true, cors: 'no' },
      { name: 'Guardian', description: '卫报API', url: 'https://open.theguardian.com/', category: 'News', auth: 'apiKey', https: true, cors: 'yes' },

      // Social
      { name: 'Twitter', description: '社交媒体', url: 'https://developer.twitter.com/', category: 'Social', auth: 'OAuth', https: true, cors: 'no' },
      { name: 'Reddit', description: 'Reddit API', url: 'https://www.reddit.com/dev/api/', category: 'Social', auth: 'OAuth', https: true, cors: 'yes' },

      // Open Data
      { name: 'NASA', description: 'NASA开放数据', url: 'https://api.nasa.gov/', category: 'Open Data', auth: 'apiKey', https: true, cors: 'yes' },
      { name: 'Data.gov', description: '美国政府开放数据', url: 'https://api.data.gov/', category: 'Open Data', auth: 'apiKey', https: true, cors: 'yes' },

      // Images
      { name: 'Unsplash', description: '图片API', url: 'https://unsplash.com/developers', category: 'Photography', auth: 'apiKey', https: true, cors: 'yes' },
      { name: 'Pexels', description: '免费图片', url: 'https://www.pexels.com/api/', category: 'Photography', auth: 'apiKey', https: true, cors: 'yes' },

      // Books
      { name: 'Google Books', description: '图书搜索', url: 'https://developers.google.com/books', category: 'Books', auth: 'apiKey', https: true, cors: 'yes' },
      { name: 'Open Library', description: '开放图书馆', url: 'https://openlibrary.org/developers/api', category: 'Books', auth: 'no', https: true, cors: 'yes' },

      // Food
      { name: 'TheMealDB', description: '食谱API', url: 'https://www.themealdb.com/api.php', category: 'Food', auth: 'no', https: true, cors: 'yes' },
      { name: 'Zomato', description: '餐厅数据', url: 'https://developers.zomato.com/', category: 'Food', auth: 'apiKey', https: true, cors: 'unknown' },

      // Health
      { name: 'FDA', description: 'FDA开放数据', url: 'https://open.fda.gov/', category: 'Health', auth: 'no', https: true, cors: 'yes' },
      { name: 'COVID-19', description: '疫情数据', url: 'https://covid19api.com/', category: 'Health', auth: 'no', https: true, cors: 'yes' },

      // Geocoding
      { name: 'OpenCage', description: '地理编码', url: 'https://opencagedata.com/', category: 'Geocoding', auth: 'apiKey', https: true, cors: 'yes' },
      { name: 'Nominatim', description: 'OpenStreetMap地理编码', url: 'https://nominatim.openstreetmap.org/', category: 'Geocoding', auth: 'no', https: true, cors: 'unknown' },

      // Security
      { name: 'Have I Been Pwned', description: '数据泄露检测', url: 'https://haveibeenpwned.com/API/v3', category: 'Security', auth: 'apiKey', https: true, cors: 'no' },

      // Video
      { name: 'YouTube', description: '视频平台', url: 'https://developers.google.com/youtube/v3', category: 'Video', auth: 'apiKey', https: true, cors: 'unknown' },
      { name: 'TMDB', description: '电影/电视数据库', url: 'https://www.themoviedb.org/documentation/api', category: 'Video', auth: 'apiKey', https: true, cors: 'yes' },

      // Animals
      { name: 'Dog API', description: '狗狗图片', url: 'https://dog.ceo/api', category: 'Animals', auth: 'no', https: true, cors: 'yes' },
      { name: 'Cat API', description: '猫咪图片', url: 'https://cat-api.brightonmclaughlan.repl.co/', category: 'Animals', auth: 'no', https: true, cors: 'unknown' },

      // Blockchain
      { name: 'Ethereum', description: '以太坊区块链', url: 'https://ethereum.org/en/developers/', category: 'Blockchain', auth: 'no', https: true, cors: 'unknown' },

      // Currency
      { name: 'ExchangeRate', description: '汇率转换', url: 'https://www.exchangerate-api.com/', category: 'Currency Exchange', auth: 'apiKey', https: true, cors: 'yes' },
      { name: 'Fixer', description: '货币汇率', url: 'https://fixer.io/', category: 'Currency Exchange', auth: 'apiKey', https: true, cors: 'unknown' },

      // Art
      { name: 'Art Institute of Chicago', description: '艺术博物馆API', url: 'https://api.artic.edu/', category: 'Art', auth: 'no', https: true, cors: 'yes' },
      { name: 'Rijksmuseum', description: '荷兰国家博物馆', url: 'https://www.rijksmuseum.nl/en/api', category: 'Art', auth: 'apiKey', https: true, cors: 'unknown' },

      // Email
      { name: 'Mailgun', description: '邮件服务', url: 'https://www.mailgun.com/', category: 'Email', auth: 'apiKey', https: true, cors: 'yes' },
      { name: 'SendGrid', description: '邮件发送', url: 'https://sendgrid.com/', category: 'Email', auth: 'apiKey', https: true, cors: 'yes' },

      // Dictionary
      { name: 'Merriam-Webster', description: '词典API', url: 'https://dictionaryapi.org/', category: 'Dictionaries', auth: 'apiKey', https: true, cors: 'unknown' },
      { name: 'Oxford', description: '牛津词典', url: 'https://developer.oxforddictionaries.com/', category: 'Dictionaries', auth: 'apiKey', https: true, cors: 'no' },
    ];
  }

  /**
   * 获取所有 API
   */
  getAll(): PublicAPI[] {
    return [...this.apis];
  }

  /**
   * 获取所有分类
   */
  getCategories(): string[] {
    const categories = new Set(this.apis.map(api => api.category));
    return Array.from(categories).sort();
  }

  /**
   * 搜索 API
   */
  search(query: string, options?: SearchOptions): PublicAPI[] {
    let results = [...this.apis];

    // 关键词搜索
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(api =>
        api.name.toLowerCase().includes(lowerQuery) ||
        api.description.toLowerCase().includes(lowerQuery) ||
        api.category.toLowerCase().includes(lowerQuery)
      );
    }

    // 按分类过滤
    if (options?.category) {
      results = results.filter(api =>
        api.category.toLowerCase() === options.category!.toLowerCase()
      );
    }

    // 按认证方式过滤
    if (options?.auth) {
      results = results.filter(api =>
        api.auth.toLowerCase() === options.auth!.toLowerCase()
      );
    }

    // 按 HTTPS 过滤
    if (options?.https !== undefined) {
      results = results.filter(api => api.https === options.https);
    }

    // 按 CORS 过滤
    if (options?.cors) {
      results = results.filter(api => api.cors === options.cors);
    }

    return results;
  }

  /**
   * 按分类获取 API
   */
  getByCategory(category: string): PublicAPI[] {
    return this.search('', { category });
  }

  /**
   * 获取免费无需认证的 API
   */
  getFree(): PublicAPI[] {
    return this.search('', { auth: 'no' });
  }

  /**
   * 获取支持 HTTPS 的 API
   */
  getSecure(): PublicAPI[] {
    return this.search('', { https: true });
  }

  /**
   * 格式化输出为 Markdown
   */
  toMarkdown(apis: PublicAPI[]): string {
    if (apis.length === 0) {
      return '没有找到匹配的 API';
    }

    let md = '| API | 描述 | 分类 | 认证 | HTTPS | CORS |\n';
    md += '|-----|------|------|------|-------|------|\n';

    for (const api of apis) {
      md += `| [${api.name}](${api.url}) | ${api.description} | ${api.category} | ${api.auth} | ${api.https ? '✅' : '❌'} | ${api.cors} |\n`;
    }

    return md;
  }

  /**
   * 格式化输出为 JSON
   */
  toJSON(apis: PublicAPI[]): string {
    return JSON.stringify(apis, null, 2);
  }
}

export default PublicAPIs;
