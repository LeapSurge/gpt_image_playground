import { useStore } from '../store'

interface StarterExample {
  id: string
  title: string
  subtitle: string
  level: '入门' | '热门' | '高级'
  needsReference: boolean
  prompt: string
  toast: string
}

const STARTER_EXAMPLES: StarterExample[] = [
  {
    id: 'photo-repair',
    title: '修复老照片',
    subtitle: '优化改图用，适合修复家庭旧照',
    level: '入门',
    needsReference: true,
    prompt: [
      '一张完美修复的旧家庭照片，写实照片修复，保留原有姿势和构图，保持人物面部特征，去除划痕、灰尘、污渍、折痕、模糊、眩光和水印文字，修复破损相纸，恢复自然肤色，清晰的面部特征，发丝细节分明，衣物纹理细致，亮度均衡，对比度柔和，渐变平滑，色彩逼真，保留微妙的复古色调，锐利但不过度处理，高分辨率，影楼级修复品质。',
      '避免：卡通、动漫、绘画、插画、3D、CGI、假皮肤、塑料脸、过度光滑的皮肤、过度锐化、多余手指、畸形手部、扭曲面部、错误眼睛、不对称面部、人物重复、添加的配饰、更换衣物、改变发型、浓妆、现代时尚、文字、标志、水印、相框、边框、伪影、噪点、过饱和、极端对比度、模糊。',
    ].join('\n\n'),
    toast: '已填入“修复老照片”示例，请先上传需要修复的照片。',
  },
  {
    id: 'doodle-overlay',
    title: '涂鸦叠加图',
    subtitle: '热门效果，适合照片二次创作',
    level: '热门',
    needsReference: true,
    prompt: [
      '请观察照片中的元素，并为每个物件加上有意义的手绘风注解。',
      '画面内容：请根据照片中的真实物品生成注解，例如披萨、汽水、草莓蛋糕。',
      '描写规则：使用像白色笔画的细线手绘线条；一笔画风格，随性、略带不均匀感；沿着物件外围加上描边轮廓；用箭头或虚线做出视线引导。',
      '文字规则：手写风格字体，带一点日系可爱感；句子简短，像自言自语的小碎念；语气偏日记感，带一点情绪。',
      '注解生成规则：饮料写味道、温度、心情；食物写口感和好吃程度；空间写氛围；整体再补一句总结，例如“今天有点幸福~”。',
      '装饰：适度加入热气、闪光、爱心、星星、小表情等元素，但不要过度装饰，保留留白空间。',
      '完成风格：像 Instagram 限时动态、杂志随手笔记风，自然、有质感、带点慵懒感。',
    ].join('\n\n'),
    toast: '已填入“涂鸦叠加图”示例，请先上传一张照片再生成。',
  },
  {
    id: 'ad-poster',
    title: '广告海报',
    subtitle: '适合活动图和宣传图',
    level: '入门',
    needsReference: false,
    prompt: '为一家咖啡店设计促销海报，主视觉是一杯冰美式和咖啡豆，画面简洁高级，留出标题和价格位置，适合社交媒体宣传。',
    toast: '已填入“广告海报”示例，可以直接修改后生成。',
  },
  {
    id: 'product-shot',
    title: '商品图',
    subtitle: '适合电商和产品展示',
    level: '入门',
    needsReference: false,
    prompt: '一款极简风格的保温杯产品图，纯色背景，柔和棚拍光线，突出材质和轮廓，画面干净，适合商品展示。',
    toast: '已填入“商品图”示例，可以直接修改后生成。',
  },
  {
    id: 'cover-visual',
    title: '封面配图',
    subtitle: '适合视频和内容封面',
    level: '热门',
    needsReference: false,
    prompt: '一张适合短视频封面的城市夜景图，霓虹灯、雨夜反光、强烈视觉冲击，构图简洁，主体明确，适合加标题文字。',
    toast: '已填入“封面配图”示例，可以直接修改后生成。',
  },
  {
    id: 'calendar-poster',
    title: '定制月历海报',
    subtitle: '自制一张可打印的 2026 年 5 月插画月历海报',
    level: '高级',
    needsReference: false,
    prompt: `{
  "type": "插画月历海报",
  "orientation": "纵向",
  "year": "{argument name=\\"year\\" default=\\"2026\\"}",
  "month": {
    "numeric": "{argument name=\\"month number\\" default=\\"5\\"}",
    "english": "{argument name=\\"month text\\" default=\\"May 2026\\"}",
    "header_text": "2026 年 5 月"
  },
  "style": "柔和可爱的日式日历设计，精致的绘本插画风格，春季柔和色调，简洁的可打印布局",
  "scene": {
    "background": "明亮的蓝天与柔和的云朵，远处的河畔或湖畔城市天际线，轻微的虚化效果，左上角和右上角有樱花枝点缀，粉色花瓣在空中飘落，底部为花草草甸边框",
    "season": "暮春，樱花主题"
  },
  "characters": {
    "count": 2,
    "left_character": "一只可爱的写实风格兔子，直立站立，穿着黑白相间的企鹅连体装，帽子上有橙色喙，腹部为浅奶油色，脚穿橙色企鹅脚拖鞋，一只爪子抬起做出欢快的姿势，大而有神的眼睛，毛绒绒的质感",
    "right_character": "一位全身休闲装扮的年轻女性，面部简化或留白，中棕色头发扎成高马尾，身穿白色衬衫、黑色超大号拉链连帽衫，搭配印有企鹅和雪花图案的深蓝色长裙"
  },
  "animals": {
    "count": 3,
    "items": [
      "一只正面站立的成年企鹅",
      "中间一只毛茸茸的灰色企鹅幼崽",
      "右侧一只正面站立的成年企鹅"
    ]
  },
  "layout": {
    "sections": [
      {
        "title": "页眉",
        "position": "顶部",
        "count": 3,
        "labels": ["2026 年", "5 月", "May 2026"]
      },
      {
        "title": "星期行",
        "position": "日历网格上方",
        "count": 7,
        "labels": ["日", "一", "二", "三", "四", "五", "六"]
      },
      {
        "title": "节假日标签",
        "position": "日期格内",
        "count": 4,
        "labels": ["劳动节", "青年节", "五一假期"]
      }
    ],
    "calendar_grid": {
      "month": "May 2026",
      "rows": 6,
      "columns": 7,
      "week_starts_on": "Sunday",
      "sunday_color": "红色",
      "saturday_color": "蓝色",
      "weekday_color": "深棕色",
      "visible_dates": [
        {
          "day": 1,
          "column": "Friday",
          "label": "劳动节"
        },
        {
          "day": 2,
          "column": "Saturday",
          "label": "五一假期"
        },
        {
          "day": 3,
          "column": "Sunday",
          "label": "五一假期"
        },
        {
          "day": 4,
          "column": "Monday",
          "label": "青年节"
        },
        {
          "day": 5,
          "column": "Tuesday",
          "label": "五一假期"
        },
        {
          "day": 6,
          "column": "Wednesday"
        },
        {
          "day": 7,
          "column": "Thursday"
        },
        {
          "day": 8,
          "column": "Friday"
        },
        {
          "day": 9,
          "column": "Saturday"
        },
        {
          "day": 10,
          "column": "Sunday"
        },
        {
          "day": 11,
          "column": "Monday"
        },
        {
          "day": 12,
          "column": "Tuesday"
        },
        {
          "day": 13,
          "column": "Wednesday"
        },
        {
          "day": 14,
          "column": "Thursday"
        },
        {
          "day": 15,
          "column": "Friday"
        },
        {
          "day": 16,
          "column": "Saturday"
        },
        {
          "day": 17,
          "column": "Sunday"
        },
        {
          "day": 18,
          "column": "Monday"
        },
        {
          "day": 19,
          "column": "Tuesday"
        },
        {
          "day": 20,
          "column": "Wednesday"
        },
        {
          "day": 21,
          "column": "Thursday"
        },
        {
          "day": 22,
          "column": "Friday"
        },
        {
          "day": 23,
          "column": "Saturday"
        },
        {
          "day": 24,
          "column": "Sunday"
        },
        {
          "day": 25,
          "column": "Monday"
        },
        {
          "day": 26,
          "column": "Tuesday"
        },
        {
          "day": 27,
          "column": "Wednesday"
        },
        {
          "day": 28,
          "column": "Thursday"
        },
        {
          "day": 29,
          "column": "Friday"
        },
        {
          "day": 30,
          "column": "Saturday"
        },
        {
          "day": 31,
          "column": "Sunday"
        }
      ]
    },
    "composition": "上半部分为大型装饰性插画，下半部分为宽敞的月历表格，圆角奶油色日历边框，标题横幅和角落处有精致的花卉点缀"
  },
  "typography": {
    "main_year": "粗体圆润的深棕色中文数字",
    "main_month": "带有白色描边的大号粉色数字",
    "subtitle": "丝带横幅上的衬线风格棕色文字",
    "weekday_headers": "简洁圆润的中文，周日为红色，周六为蓝色"
  },
  "rendering": "高分辨率可打印海报，文字清晰，边距平衡，可爱的商业文具美学"
}`,
    toast: '已填入“定制月历海报”示例，可以直接生成。',
  },
]

interface FirstImageStarterProps {
  mode?: 'full' | 'compact'
  onApply?: () => void
}

function levelClass(level: StarterExample['level']) {
  if (level === '热门') {
    return 'bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-300'
  }
  if (level === '高级') {
    return 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300'
  }
  return 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300'
}

export default function FirstImageStarter({ mode = 'full', onApply }: FirstImageStarterProps) {
  const setPrompt = useStore((s) => s.setPrompt)
  const showToast = useStore((s) => s.showToast)

  const applyExample = (example: StarterExample) => {
    setPrompt(example.prompt)
    showToast(example.toast, 'success')
    onApply?.()
  }

  if (mode === 'compact') {
    return (
      <section className="rounded-[24px] border border-white/60 bg-white/80 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-gray-900/70 dark:shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-blue-500 dark:text-blue-300">继续试试</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">换个方向继续生成</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">这里保留常用案例。选一个方向，直接替换到底部输入框。</p>
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500">更像灵感补充，不打断当前结果</div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {STARTER_EXAMPLES.map((example) => (
            <button
              key={example.id}
              type="button"
              onClick={() => applyExample(example)}
              className="group rounded-2xl border border-gray-200/80 bg-white/90 px-4 py-3 text-left transition-all hover:border-blue-300 hover:bg-white hover:shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-blue-400/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{example.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${levelClass(example.level)}`}>
                      {example.level}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">{example.subtitle}</p>
                </div>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                  {example.needsReference ? '参考图' : '直接生成'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-gray-900/70 dark:shadow-[0_16px_50px_rgba(0,0,0,0.28)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-blue-500 dark:text-blue-300">
            首图案例辅助
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            不会写提示词，先试一个案例
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            点击示例会直接填入输入框。你只需要改几个词，就能开始生成第一张图。
          </p>
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500">
          先写主体，再补风格和场景
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {STARTER_EXAMPLES.map((example) => (
          <button
            key={example.id}
            type="button"
            onClick={() => applyExample(example)}
            className="group rounded-2xl border border-gray-200/80 bg-white/85 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-blue-400/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {example.title}
              </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{example.subtitle}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${levelClass(example.level)}`}>
                {example.level}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                {example.needsReference ? '需上传参考图' : '可直接生成'}
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                点击一键填入
              </span>
            </div>

            <div className="mt-4 line-clamp-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
              {example.prompt}
            </div>

            <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-600 transition-colors group-hover:text-blue-700 dark:text-blue-300 dark:group-hover:text-blue-200">
              使用这个案例
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
