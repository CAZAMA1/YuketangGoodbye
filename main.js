// ==UserScript==
// @name         雨课堂刷课+刷题助手
// @name:zh-CN   雨课堂刷课+刷题助手
// @namespace    https://github.com/CAZAMA1/YuketangGoodbye
// @version      2.5.1
// @description  雨课堂视频自动播放、多倍速、PPT自动翻页，并支持调用 DeepSeek/Kimi/通义/OpenAI/Gemini 等大模型 OCR 识别题目并自动作答，全程挂机。
// @description:zh-CN  雨课堂视频自动播放、多倍速、PPT自动翻页，并支持调用 DeepSeek/Kimi/通义/OpenAI/Gemini 等大模型 OCR 识别题目并自动作答，全程挂机。
// @author       翔子酱
// @license      GPL-3.0
// @homepage     https://github.com/CAZAMA1/YuketangGoodbye
// @supportURL   https://github.com/CAZAMA1/YuketangGoodbye/issues
// @updateURL    https://raw.githubusercontent.com/CAZAMA1/YuketangGoodbye/main/main.js
// @downloadURL  https://raw.githubusercontent.com/CAZAMA1/YuketangGoodbye/main/main.js
// @match        *://*.yuketang.cn/*
// @match        *://*.gdufemooc.cn/*
// @match        *://*.xuetangx.com/*
// @run-at       document-start
// @icon         https://yuketang.cn/favicon.ico
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.openai.com
// @connect      api.moonshot.cn
// @connect      api.deepseek.com
// @connect      dashscope.aliyuncs.com
// @connect      generativelanguage.googleapis.com
// @connect      cdn.jsdelivr.net
// @connect      unpkg.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @require      https://unpkg.com/tesseract.js@v2.1.0/dist/tesseract.min.js
// ==/UserScript==


const _attachShadow = Element.prototype.attachShadow;
const basicConf = {
  version: '2.5.1',
  rate: 2, //用户可改 视频播放速率,可选值[1,1.25,1.5,2,3,16],默认为2倍速，实测4倍速往上有可能出现 bug，3倍速暂时未出现bug，推荐二倍/一倍。
  pptTime: 3000, // 用户可改 ppt播放时间，单位毫秒
}

function getAIConf() {
  let conf = {};
  try {
    if (typeof GM_getValue === 'function') {
      const gmConf = GM_getValue('ykt_ai_conf', null);
      if (gmConf && typeof gmConf === 'object') {
        conf = gmConf;
      }
    }
  } catch (err) {
    console.warn('GM_getValue error', err);
  }
  if (!conf || Object.keys(conf).length === 0) {
    try {
      const raw = localStorage.getItem('ykt_ai_conf');
      if (raw) {
        conf = JSON.parse(raw);
        if (typeof GM_setValue === 'function') GM_setValue('ykt_ai_conf', conf);
      }
    } catch (err) {
      conf = {};
    }
  }
  return conf || {};
}

function saveAIConf(conf) {
  try {
    localStorage.setItem('ykt_ai_conf', JSON.stringify(conf));
  } catch (err) {
    console.warn('localStorage save error', err);
  }
  try {
    if (typeof GM_setValue === 'function') GM_setValue('ykt_ai_conf', conf);
  } catch (err) {
    console.warn('GM_setValue error', err);
  }
}

window.getAIConf = getAIConf;
window.saveAIConf = saveAIConf;

function isTaskFinishedText(text) {
  if (!text) return false;
  const cleaned = text.replace(/\s+/g, '');
  // 扩展完成状态关键词
  return /(已完成|完成度100|100%|100％|学习完成|已学完|进度100|已读|已提交|已作答)/.test(cleaned);
}

// 新增：检查DOM节点是否包含完成标记（更智能地从列表页判断）
function isTaskCompletedInList(courseWrapper) {
  if (!courseWrapper) return false;

  // 方法1: 检查文本内容
  const courseText = courseWrapper.innerText || '';
  if (isTaskFinishedText(courseText)) return true;

  // 方法2: 检查进度信息（支持98%+的高完成度）
  const progressText = courseWrapper.querySelector('.progress')?.innerText ||
                      courseWrapper.querySelector('.percent')?.innerText ||
                      courseWrapper.querySelector('.sub-info')?.innerText || '';
  if (/(100|99|98)%/.test(progressText)) return true;

  // 方法3: 检查是否有完成标记的class或icon
  if (courseWrapper.querySelector('.icon-finish') ||
      courseWrapper.querySelector('.finished') ||
      courseWrapper.classList?.contains('finished')) return true;

  return false;
}
const $ = { // 开发脚本的工具对象
  panel: "",      // panel节点，后期赋值
  observer: "",   // 保存observer观察对象
  userInfo: {     // 实时同步刷课记录，避免每次都从头开始检测
    allInfo: {},              // 刷课记录，运行时赋值
    getProgress(classUrl) {   // 参数：classUrl:课程地址
      if (!localStorage.getItem("[雨课堂脚本]刷课进度信息"))   // 第一次初始化这个localStorage
        this.setProgress(classUrl, 0, 0);
      this.allInfo = JSON.parse(localStorage.getItem("[雨课堂脚本]刷课进度信息"));  // 将信息保存到本地
      if (!this.allInfo[classUrl])         // 第一次初始化这个课程
        this.setProgress(classUrl, 0, 0);
      console.log(this.allInfo);
      return this.allInfo[classUrl];   // 返回课程记录对象{outside:外边第几集，inside:里面第几集}
    },
    setProgress(classUrl, outside, inside = 0) {   // 参数:classUrl:课程地址,outside为最外层集数，inside为最内层集数
      this.allInfo[classUrl] = {
        outside,
        inside
      }
      localStorage.setItem("[雨课堂脚本]刷课进度信息", JSON.stringify(this.allInfo));   // localstorage只能保存字符串，需要先格式化为字符串
    },
    removeProgress(classUrl) {   // 移除课程刷课信息，用在课程刷完的情况
      delete this.allInfo[classUrl];
      localStorage.setItem("[雨课堂脚本]刷课进度信息", JSON.stringify(this.allInfo));
    }
  },
  alertMessage(message) { // 向页面中添加信息
    const li = document.createElement("li");
    li.innerText = message;
    $.panel.querySelector('.n_infoAlert').appendChild(li);
  },
  ykt_speed() {   // 视频加速
    const rate = basicConf.rate || 2;
    let speedwrap = document.getElementsByTagName("xt-speedbutton")[0];
    let speedlist = document.getElementsByTagName("xt-speedlist")[0];
    let speedlistBtn = speedlist.firstElementChild.firstElementChild;

    speedlistBtn.setAttribute('data-speed', rate);
    speedlistBtn.setAttribute('keyt', rate + '.00');
    speedlistBtn.innerText = rate + '.00X';
    $.alertMessage('已开启' + rate + '倍速');

    // 模拟点击
    let mousemove = document.createEvent("MouseEvent");
    mousemove.initMouseEvent("mousemove", true, true, unsafeWindow, 0, 10, 10, 10, 10, 0, 0, 0, 0, 0, null);
    speedwrap.dispatchEvent(mousemove);
    speedlistBtn.click();
  },
  claim() {   // 视频静音
    document.querySelector("#video-box > div > xt-wrap > xt-controls > xt-inner > xt-volumebutton > xt-icon").click();
    $.alertMessage('已开启静音');
  },
  videoDetail(video = document.querySelector('video')) {  // 不用鼠标模拟操作就能实现的一般视频加速静音方法
    video.play();
    video.volume = 0;
    video.playbackRate = basicConf.rate;
    $.alertMessage(`实际上已默认静音和${basicConf.rate}倍速`);
  },
  audioDetail(audio = document.querySelector('audio')) {   // 音频处理
    audio.play();
    audio.volume = 0;
    audio.playbackRate = basicConf.rate;
    $.alertMessage(`实际上已默认静音和${basicConf.rate}倍速`);
  },
  observePause() {  // 视频意外暂停，自动播放
    var targetElement = document.getElementsByClassName('play-btn-tip')[0]; // 要监听的dom元素
    if (document.getElementsByClassName('play-btn-tip').length === 0) { // 还未加载出来视频dom时，开启轮回扫描
      setTimeout(observePause, 100);
    } else {
      $.observer = new MutationObserver(function (mutationsList) {
        for (var mutation of mutationsList) {
          if (mutation.type === 'childList' && mutation.target === targetElement && targetElement.innerText === '播放') { // 被监视的元素状态
            console.log('视频意外暂停了，已恢复播放');
            document.getElementsByTagName('video')[0].play();
            $.alertMessage('视频意外暂停了，已恢复播放');
          }
        }
      });
      var config = { childList: true };
      $.observer.observe(targetElement, config);
      document.querySelector("video").play();     //防止进入下一章时由于鼠标离开窗口而在视频开始时就暂停导致永远无法触发监听器
    }
  },
  preventScreenCheck() {  // 阻止pro/lms雨课堂切屏检测
    const window = unsafeWindow;
    const blackList = new Set(["visibilitychange", "blur", "pagehide"]); // 限制调用事件名单：1.选项卡的内容变得可见或被隐藏时2.元素失去焦点3.页面隐藏事件
    const isDebug = false;
    const log = console.log.bind(console, "[阻止pro/lms切屏检测]");
    const debug = isDebug ? log : () => { };
    window._addEventListener = window.addEventListener;
    window.addEventListener = (...args) => {                  // args为剩余参数数组
      if (!blackList.has(args[0])) {                          // args[0]为想要定义的事件，如果不在限制名单，调用原生函数
        debug("allow window.addEventListener", ...args);
        return window._addEventListener(...args);
      } else {                                                // 否则不执行，打印参数信息
        log("block window.addEventListener", ...args);
        return undefined;
      }
    };
    document._addEventListener = document.addEventListener;
    document.addEventListener = (...args) => {
      if (!blackList.has(args[0])) {
        debug("allow document.addEventListener", ...args);
        return window._addEventListener(...args);
      } else {
        log("block document.addEventListener", ...args);
        return undefined;
      }
    };
    log("addEventListener hooked!");
    if (isDebug) { // DEBUG ONLY: find out all timers
      window._setInterval = window.setInterval;
      window.setInterval = (...args) => {
        const id = window._setInterval(...args);
        debug("calling window.setInterval", id, ...args);
        return id;
      };
      debug("setInterval hooked!");
      window._setTimeout = window.setTimeout;
      window.setTimeout = (...args) => {
        const id = window._setTimeout(...args);
        debug("calling window.setTimeout", id, ...args);
        return id;
      };
      debug("setTimeout hooked!");
    }
    Object.defineProperties(document, {
      hidden: {                 // 表示页面是（true）否（false）隐藏。
        value: false
      },
      visibilityState: {        // 当前可见元素的上下文环境。由此可以知道当前文档 (即为页面) 是在背后，或是不可见的隐藏的标签页
        value: "visible"        // 此时页面内容至少是部分可见
      },
      hasFocus: {               // 表明当前文档或者当前文档内的节点是否获得了焦点
        value: () => true
      },
      onvisibilitychange: {     // 当其选项卡的内容变得可见或被隐藏时，会在 document 上触发 visibilitychange 事件  ==  visibilitychange
        get: () => undefined,
        set: () => { }
      },
      onblur: {                 // 当元素失去焦点的时候
        get: () => undefined,
        set: () => { }
      }
    });
    log("document properties set!");
    Object.defineProperties(window, {
      onblur: {
        get: () => undefined,
        set: () => { }
      },
      onpagehide: {
        get: () => undefined,
        set: () => { }
      },
    });
    log("window properties set!");
  }
}

// --- 核心 OCR 识别函数  ---
async function recognizeTextFromElement(element) {
    if (!element) return "无元素";

    try {
        $.alertMessage("正在截图...");
        // 1. 将 DOM 转为 Canvas 图片
        const canvas = await html2canvas(element, {
            useCORS: true,
            logging: false,
            scale: 2,
            backgroundColor: '#ffffff'
        });

        $.alertMessage("正在OCR识别(首次慢，请耐心等待)...");

        // 2. 使用 Tesseract 进行识别
        // 关键修改：去掉了被拦截的 langPath，使用默认配置
        const { data: { text } } = await Tesseract.recognize(
            canvas,
            'chi_sim', // 简体中文
            {
                // 去掉被 CSP 拦截的 langPath
                // 使用默认源，虽然慢一点，但不会报错
                logger: m => {
                    if (m.status === 'downloading tesseract lang') {
                        // 可以在这里提示下载进度
                        console.log(`正在下载语言包: ${(m.progress * 100).toFixed(0)}%`);
                    }
                }
            }
        );

        // 3. 清理结果
        return text.replace(/\s+/g, ' ').trim();
    } catch (err) {
        console.error("OCR 错误:", err);
        // 如果是 Network Error，通常是因为网络慢，多试几次
        $.alertMessage("OCR 失败: " + (err.message || "网络错误"));
        return "OCR识别出错";
    }
}

// --- 大模型 API 调用函数 (动态配置版) ---
async function fetchAnswerFromAI(ocrText) {
    // 1. 从 localStorage 获取配置
    const savedConf = getAIConf();

    let API_URL = savedConf.url;
    const API_KEY = savedConf.key;
    const MODEL_NAME = savedConf.model;

    return new Promise((resolve, reject) => {
        // 安全检查
      if (!API_URL) {
        const msg = "❌ 请先在[AI配置]中填写接口地址";
        $.alertMessage(msg);
        reject(msg);
        return;
      }
      if (!API_KEY || API_KEY.includes("sk-xxxx")) {
            const msg = "❌ 请点击[AI配置]按钮填入正确的API Key";
            $.alertMessage(msg);
            reject(msg);
            return;
        }
      if (!MODEL_NAME) {
        const msg = "❌ 请在[AI配置]中填写模型名称";
        $.alertMessage(msg);
        reject(msg);
        return;
      }

        if (/^https:\/\/api\.deepseek\.com\/chat\/completions$/i.test(API_URL)) {
          API_URL = 'https://api.deepseek.com/v1/chat/completions';
          $.alertMessage('已自动修正 DeepSeek 接口地址为 /v1/chat/completions');
        }
        if (/^https:\/\/api\.openai\.com\/chat\/completions$/i.test(API_URL)) {
          API_URL = 'https://api.openai.com/v1/chat/completions';
          $.alertMessage('已自动修正 OpenAI 接口地址为 /v1/chat/completions');
        }
        if (/^https:\/\/dashscope\.aliyuncs\.com\/compatible-mode\/v1$/i.test(API_URL)) {
          API_URL = API_URL.replace(/\/?$/, '/chat/completions');
          $.alertMessage('已自动补全 DashScope 接口路径 /chat/completions');
        }

        const prompt = `你是一个专业的做题助手。请先分析下面的 OCR 识别文本，判断题目类型，然后给出答案。

        【输出规则】：
        1. 识别到是【判断题】时：
           - 如果是正确的，请输出：正确答案：对
           - 如果是错误的，请输出：正确答案：错
        2. 识别到是【单选题】或【多选题】时：
           - 请直接输出选项字母，如：正确答案：A 或 正确答案：ABD
        3. 格式必须包含“正确答案：”前缀。

        【题目内容】：
        ${ocrText}`;

        // 判断是否为 Gemini 接口（鉴权方式与请求/响应体格式均不同）
        const isGemini = /generativelanguage\.googleapis\.com/i.test(API_URL);

        if (isGemini) {
          // Gemini：API Key 拼入 URL query 参数，不需要 Authorization 头
          const geminiUrl = API_URL.includes('?key=')
            ? API_URL
            : `${API_URL}?key=${API_KEY}`;
          $.alertMessage('🔮 正在调用 Gemini 接口...');
          GM_xmlhttpRequest({
            method: "POST",
            url: geminiUrl,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({
              contents: [{
                parts: [{ text: `你是一个只输出答案的助手。判断题输出'对'或'错'，选择题输出字母。\n\n${prompt}` }]
              }],
              generationConfig: { temperature: 0.1 }
            }),
            timeout: 15000,
            onload: function(response) {
              if (response.status === 200) {
                try {
                  const resJson = JSON.parse(response.responseText);
                  const answerText = resJson.candidates[0].content.parts[0].text;
                  resolve(answerText);
                } catch (e) {
                  reject('Gemini JSON解析失败: ' + e.message);
                }
              } else {
                const errMsg = `❌ Gemini 请求失败: HTTP ${response.status}`;
                $.alertMessage(errMsg);
                if (response.status === 400) $.alertMessage('原因: 请求格式错误或模型名称有误');
                if (response.status === 403) $.alertMessage('原因: API Key 无效或无访问权限');
                reject(errMsg);
              }
            },
            onerror: function() { reject('Gemini 网络错误'); },
            ontimeout: function() { reject('Gemini 请求超时'); }
          });
        } else {
          // 标准 OpenAI 兼容接口（DeepSeek / Moonshot / DashScope / OpenAI 等）
          GM_xmlhttpRequest({
            method: "POST",
            url: API_URL,
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${API_KEY}`
            },
            data: JSON.stringify({
              model: MODEL_NAME,
              messages: [
                { role: "system", content: "你是一个只输出答案的助手。判断题输出'对'或'错'，选择题输出字母。" },
                { role: "user", content: prompt }
              ],
              temperature: 0.1
            }),
            timeout: 10000,
            onload: function(response) {
              if (response.status === 200) {
                try {
                  const resJson = JSON.parse(response.responseText);
                  const answerText = resJson.choices[0].message.content;
                  resolve(answerText);
                } catch (e) {
                  reject('JSON解析失败');
                }
              } else {
                const errMsg = `❌ 请求失败: HTTP ${response.status}`;
                $.alertMessage(errMsg);
                if (response.status === 401) $.alertMessage('原因: API Key 无效或余额不足');
                reject(errMsg);
              }
            },
            onerror: function() { reject('网络错误'); },
            ontimeout: function() { reject('请求超时'); }
          });
        }
    });
}

// --- 答案解析与点击提交函数 (适配 Element UI 结构) ---
async function autoSelectAndSubmit(aiResponse, itemBodyElement) {
    // 1. 提取 AI 回复中的选项 (支持 "A", "ABD", "对", "错")
    const match = aiResponse.match(/(?:正确)?答案[：:]?\s*([A-F]+(?:[,，][A-F]+)*|[对错]|正确|错误)/i);

    if (!match) {
        $.alertMessage("❌ 未提取到有效选项，请人工检查");
        return;
    }

    let answerRaw = match[1].replace(/[,，]/g, '').trim();
    let targetIndices = [];

    // 2. 将答案转换为索引 [0, 1, 2...]
    if (answerRaw === '对' || answerRaw === '正确') {
        targetIndices = [0]; // A
    } else if (answerRaw === '错' || answerRaw === '错误') {
        targetIndices = [1]; // B
    } else {
        const map = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5 };
        for (let char of answerRaw.toUpperCase()) {
            if (map[char] !== undefined) targetIndices.push(map[char]);
        }
    }

    if (targetIndices.length === 0) return;

    $.alertMessage(`✅ AI建议选择: ${answerRaw}`);

    // 3. 查找选项列表容器
    let listContainer = itemBodyElement.querySelector('.list-inline.list-unstyled-radio') || // 判断题容器
                        itemBodyElement.querySelector('.list-unstyled.list-unstyled-radio') || // 选择题容器
                        itemBodyElement.querySelector('.list-unstyled') ||
                        itemBodyElement.querySelector('ul.list');

    if (!listContainer) {
        $.alertMessage("❌ 未找到选项列表容器");
        return;
    }
    // 获取所有选项 li
    const options = listContainer.querySelectorAll('li');

    // 4. 执行点击
    for (let index of targetIndices) {
        if (options[index]) {
            // 【核心修改】精准定位点击目标
            // 优先查找 Element UI 的 label 包装器 (el-radio 或 el-checkbox)
            // 其次查找 文字标签 (el-radio__label)
            // 最后查找 input 本身
            const clickable = options[index].querySelector('label.el-radio') ||
                              options[index].querySelector('label.el-checkbox') ||
                              options[index].querySelector('.el-radio__label') ||
                              options[index].querySelector('.el-checkbox__label') ||
                              options[index].querySelector('input') ||
                              options[index]; // 实在找不到就点 li 本身

            if (clickable) {
                clickable.click();
                // 多选题防抖延迟
                await new Promise(r => setTimeout(r, 300));
            }
        }
    }

    // 5. 点击提交按钮
    await new Promise(r => setTimeout(r, 800));

    // 使用你提供的 class 进行定位
    // 结合 class 和 文字内容双重校验，防止点错
    let submitBtn = null;

    // 策略A：在当前题目区域内找
    const localBtns = itemBodyElement.parentElement.querySelectorAll('.el-button--primary');
    for (let btn of localBtns) {
        if (btn.innerText.includes('提交')) {
            submitBtn = btn;
            break;
        }
    }

    // 策略B：如果在局部没找到，在全局找 (使用完整类名)
    if (!submitBtn) {
        const allSubmitBtns = document.querySelectorAll('.el-button.el-button--primary.el-button--medium');
        for (let btn of allSubmitBtns) {
            // 必须包含“提交”二字，且可见
            if (btn.innerText.includes('提交') && btn.offsetParent !== null) {
                submitBtn = btn;
                break;
            }
        }
    }

    if (submitBtn) {
        $.alertMessage("正在提交...");
        submitBtn.click();
    } else {
        $.alertMessage("⚠️ 未找到提交按钮,请手动提交。");
    }
}

// --- 通用作业/测验处理流程 ---
async function solveAssessment({ label = '作业', navSelectors, contentSelectors, questionSelectors } = {}) {
  const navSel = navSelectors || [
    '.subject-item.J_order',
    '.subject-item',
    '.exam-question-item',
    '.question-card-list li'
  ];
  const questionSel = questionSelectors || [
    '.exam-main .subject-item',
    '.subject-item'
  ];
  const contentSel = contentSelectors || [
    '.item-body',
    '.question-body',
    '.question-content',
    '.item-wrapper'
  ];

  $.alertMessage(`等待${label}加载...`);

  const delay = ms => new Promise(r => setTimeout(r, ms));
  const resolveContent = (baseRoot) => {
    const root = baseRoot || document;
    const typeEl = root.querySelector('.item-type');
    if (typeEl && typeEl.parentElement) return typeEl.parentElement;
    for (const sel of contentSel) {
      const candidate = root.querySelector(sel);
      if (candidate) return candidate;
    }
    return root !== document ? root : null;
  };
  const isAnswered = (node) => {
    if (!node) return false;
    if (node.querySelector('.el-radio.is-checked') || node.querySelector('.el-checkbox.is-checked')) return true;
    const inputs = node.querySelectorAll('input[type="radio"],input[type="checkbox"]');
    return Array.from(inputs).some(input => input.checked || input.classList.contains('is-checked'));
  };

  let navItems = [];
  let questionItems = [];
  let navMode = true;
  let maxRetries = 40;
  while (maxRetries > 0) {
    for (const sel of navSel) {
      navItems = Array.from(document.querySelectorAll(sel));
      if (navItems.length > 0) break;
    }
    if (navItems.length > 0) break;

    if (questionSel.length > 0) {
      for (const sel of questionSel) {
        questionItems = Array.from(document.querySelectorAll(sel));
        if (questionItems.length > 0) break;
      }
      if (questionItems.length > 0) {
        navMode = false;
        break;
      }
    }

    await delay(500);
    maxRetries--;
  }

  if (navMode && navItems.length === 0) {
    throw new Error(`${label}题目未加载或页面结构已更新`);
  }
  if (!navMode && questionItems.length === 0) {
    throw new Error(`${label}题目未加载，无法识别`);
  }

  let index = 0;
  while (true) {
    let currentList = [];
    if (navMode) {
      for (const sel of navSel) {
        currentList = Array.from(document.querySelectorAll(sel));
        if (currentList.length > 0) break;
      }
    } else {
      for (const sel of questionSel) {
        currentList = Array.from(document.querySelectorAll(sel));
        if (currentList.length > 0) break;
      }
    }

    if (currentList.length === 0) break;
    if (index >= currentList.length) break;

    const listItem = currentList[index];
    listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });

    let targetEl;
    if (navMode) {
      listItem.click();
      await delay(2000);

      const disabledBtns = document.querySelectorAll('.el-button.el-button--info.is-disabled.is-plain');
      if (disabledBtns.length > 0) {
        $.alertMessage(`${label}第 ${index + 1} 题已完成，跳过...`);
        index++;
        continue;
      }
      targetEl = resolveContent(document);
      if (targetEl && isAnswered(targetEl)) {
        $.alertMessage(`${label}第 ${index + 1} 题已选择，跳过...`);
        index++;
        continue;
      }
      if (!targetEl) targetEl = document.body;
    } else {
      await delay(800);
      if (isAnswered(listItem)) {
        $.alertMessage(`${label}第 ${index + 1} 题已选择，跳过...`);
        index++;
        continue;
      }
      targetEl = resolveContent(listItem);
    }

    if (targetEl) {
      $.alertMessage(`正在处理${label}第 ${index + 1} 题...`);
      const ocrResult = await recognizeTextFromElement(targetEl);
      const preview = (ocrResult || '').substring(0, 16);
      $.alertMessage(`${label}第 ${index + 1} 题识别: ${preview}...`);
      if (ocrResult && ocrResult.length > 5) {
        try {
          $.alertMessage('🤖 正在请求AI获取答案...');
          const aiResponse = await fetchAnswerFromAI(ocrResult);
          await autoSelectAndSubmit(aiResponse, targetEl);
        } catch (err) {
          $.alertMessage(`${label}AI答题失败: ${err}`);
          console.error(err);
        }
      }
    } else {
      $.alertMessage(`⚠️ 未找到${label}第 ${index + 1} 题内容区域`);
    }

    await delay(2000);
    index++;
  }

  const finalBtn = Array.from(document.querySelectorAll('button.el-button--primary, button'))
    .find(btn => /交卷|提交作业|提交考试|提交测验|完成答题/.test(btn.innerText || '') && !btn.disabled && btn.offsetParent !== null);
  if (finalBtn) {
    $.alertMessage(`尝试点击${label}提交按钮`);
    finalBtn.click();
    await new Promise(r => setTimeout(r, 800));
    const confirmBtn = document.querySelector('.el-message-box__btns .el-button--primary');
    if (confirmBtn && !confirmBtn.disabled) confirmBtn.click();
  }

  $.alertMessage(`${label}识别完毕，准备返回`);
}

async function autoTriggerExamStart() {
  const keywords = ['开始答题', '开始考试', '继续考试', '继续答题', '确认开始', '继续作答', '立即考试', '确定'];
  for (let i = 0; i < 12; i++) {
    const buttons = Array.from(document.querySelectorAll('button, .el-button'));
    const target = buttons.find(btn => {
      if (!btn || btn.disabled || btn.offsetParent === null) return false;
      const text = (btn.innerText || '').trim();
      return keywords.some(key => text.includes(key));
    });
    if (target) {
      target.click();
      await new Promise(r => setTimeout(r, 1500));
      return true;
    }
    await new Promise(r => setTimeout(r, 800));
  }
  return false;
}

async function waitExamResultPage(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  const keywords = ['已交卷', '试卷得分', '查看试卷', '错题数', '试卷得分', '得分'];
  while (Date.now() < deadline) {
    const bodyText = (document.body && document.body.innerText) || '';
    let hit = 0;
    for (const key of keywords) {
      if (bodyText.includes(key)) {
        hit++;
        if (hit >= 2) return true;
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function autoExitExamPage() {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const backSelectors = [
    '.exam-header__back',
    '.exam-result__back',
    '.header-back',
    '.back-btn',
    '.btn-back'
  ];
  for (const sel of backSelectors) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null) {
      el.click();
      await delay(1500);
      return true;
    }
  }
  const clickable = Array.from(document.querySelectorAll('a,button,span,div'))
    .find(el => {
      if (!el || el.offsetParent === null) return false;
      const text = (el.innerText || '').trim();
      return text && /返回|回到课程|退出考试/.test(text);
    });
  if (clickable) {
    clickable.click();
    await delay(1500);
    return true;
  }
  history.back();
  await delay(1500);
  if (location.host.includes('examination.xuetangx.com')) {
    try { window.close(); } catch (e) { /* ignore */ }
  }
  return true;
}

function xuetang_exam() {
  if (window.__yktExamRunning) return;
  window.__yktExamRunning = true;
  $.alertMessage('检测到考试系统页面，尝试自动答题...');
  (async () => {
    await new Promise(r => setTimeout(r, 1500));
    const started = await autoTriggerExamStart();
    if (started) {
      $.alertMessage('已自动点击考试按钮');
    } else {
      $.alertMessage('未找到开始考试按钮，如未进入答题请手动操作');
    }
    try {
      await solveAssessment({
        label: '考试',
        navSelectors: ['.subject-item.J_order', '.question-card li', '.question-card__item'],
        questionSelectors: ['.exam-main .subject-item', '.subject-item'],
        contentSelectors: ['.item-body', '.exercise-item', '.question-wrap']
      });
      $.alertMessage('考试题目已处理完毕，正在检查成绩页...');
      const finished = await waitExamResultPage();
      if (finished) {
        $.alertMessage('检测到成绩信息，准备返回课程');
        await autoExitExamPage();
      } else {
        $.alertMessage('未检测到成绩信息，如已完成请手动返回课程页面');
      }
    } catch (err) {
      $.alertMessage(`考试处理失败: ${err.message || err}`);
    }
  })();
}

window.$ = $;
window.start = start;

function addWindow() {
  // 创建iframe
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '40px';
  iframe.style.left = '40px';
  iframe.style.width = '500px';
  iframe.style.height = '300px'; // 稍微加高一点以容纳设置面板
  iframe.style.zIndex = '999999';
  iframe.style.border = '1px solid #a3a3a3';
  iframe.style.borderRadius = '10px';
  iframe.style.background = '#fff';
  iframe.style.overflow = 'hidden'; // 避免缩小时出现滚动条
  iframe.style.boxShadow = '6px 4px 17px 2px #000000';
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('id', 'ykt-helper-iframe');
  iframe.setAttribute('allowtransparency', 'true');
  document.body.appendChild(iframe);

  // iframe内容
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <style>
      html, body { overflow:hidden; }
      body { margin:0; font-family: Avenir, Helvetica, Arial, sans-serif; color: #636363; background:transparent; }
      .mini-basic{ position: absolute; inset:0; background:#3a7afe; color:#fff; height:100%; width:100%; min-height:42px; min-width:42px; border-radius:10px; text-align:center; line-height:1; z-index:1000000; cursor:pointer; display:none; align-items:center; justify-content:center; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.18); }
      .mini-basic.show { display:flex; }
      .n_panel { width:100%; height:100%; background:#fff; border-radius:10px; position:relative; overflow:hidden; }
      .n_header { text-align:center; height:40px; background:#f7f7f7; color:#000; font-size:18px; line-height:40px; border-radius:10px 10px 0 0; border-bottom:2px solid #eee; cursor:move; position:relative;}
      .tools{position:absolute;right:0;top:0;}
      .tools ul{margin:0;padding:0;}
      .tools ul li{position:relative;display:inline-block;padding:0 5px;cursor:pointer;}
      .n_body { font-weight:bold; font-size:13px; line-height:26px; height:calc(100% - 85px); overflow-y:auto; padding: 5px;}
      .n_infoAlert { margin:0; padding:0; list-style:none; }
      .n_footer { position:absolute; bottom:0; left:0; width:100%; background:#f7f7f7; color:#c5c5c5; font-size:13px; line-height:25px; border-radius:0 0 10px 10px; border-bottom:2px solid #eee; display:flex; justify-content:center; align-items:center; padding: 5px 0;}

      /* 按钮通用样式 */
      button { border-radius:6px; border:0; color:#fff; cursor:pointer; margin:0 5px; padding: 5px 10px; font-size: 12px; }
      #n_button { background-color:blue; }
      #n_button:hover { background-color:yellow; color:#000; }
      #n_clear { background-color:#ff4d4f; }
      #n_setting { background-color:#52c41a; }

      /* 设置面板样式 */
      #n_settings_panel { display:none; position:absolute; top:40px; left:0; width:100%; height:calc(100% - 40px); background:#fff; z-index:99; padding:15px; box-sizing:border-box; overflow-y:auto; }
      .form-item { margin-bottom: 10px; }
      .form-item label { display:block; margin-bottom: 3px; font-size: 12px; color: #333; }
      .form-item input { width: 95%; padding: 5px; border: 1px solid #ddd; border-radius: 4px; }
      .settings-footer { text-align: center; margin-top: 15px; }
      .settings-footer button { padding: 6px 15px; }
      .form-item select { width: 100%; padding: 5px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; font-size: 12px; }
      .form-item select[readonly], .form-item input[readonly] { background: #f5f5f5; cursor: default; }
      .model-label { display:flex; align-items:center; justify-content:space-between; margin-bottom:3px; font-size:12px; color:#333; }
      #fetch_models_btn { background:#52c41a; font-size:11px; padding:2px 8px; margin:0; border-radius:4px; cursor:pointer; }
      #fetch_models_btn:disabled { background:#aaa; cursor:not-allowed; }
      #ai_model_custom { width:100%; padding:5px; border:1px solid #ddd; border-radius:4px; box-sizing:border-box; font-size:12px; margin-top:4px; display:none; }
    </style>

    <div class="mini-basic" id="mini-basic">放大</div>
    <div class="n_panel" id="n_panel">
      <div class="n_header" id="n_header">
        雨课堂刷课助手
        <div class='tools'>
          <ul>
            <li class='minimality' id="minimality">_</li>
            <li class='question' id="question">?</li>
          </ul>
        </div>
      </div>

      <div class="n_body">
        <ul class="n_infoAlert" id="n_infoAlert">
          <li>⭐ 脚本支持：雨课堂所有版本</li>
          <li>🤖 <strong>支持模型：</strong>DeepSeek、Kimi(Moonshot)、通义千问、OpenAI、Gemini</li>
          <li>📢 <strong>使用必读：</strong>自动答题需先点击<span style="color:green">[AI配置]</span>填入API Key</li>
          <li>🚀 配置完成后，点击<span style="color:blue">[开始刷课]</span>即可启动视频与作业挂机</li>
          <hr>
        </ul>
      </div>

      <div id="n_settings_panel">
          <div class="form-item">
            <label>服务商:</label>
            <select id="ai_provider">
              <option value="deepseek">DeepSeek</option>
              <option value="moonshot">Kimi (Moonshot)</option>
              <option value="dashscope">通义千问 (DashScope)</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="custom">自定义</option>
            </select>
          </div>
          <div class="form-item">
            <label>API URL:</label>
            <input type="text" id="ai_url" readonly style="background:#f5f5f5;width:95%;padding:5px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;font-size:11px;">
          </div>
          <div class="form-item">
            <label>API KEY (密钥):</label>
            <input type="password" id="ai_key" placeholder="sk-xxxxxxxx">
          </div>
          <div class="form-item">
            <div class="model-label">
              <span>模型:</span>
              <button id="fetch_models_btn" type="button">获取列表</button>
            </div>
            <select id="ai_model_select">
              <option value="">-- 请先选择服务商 --</option>
            </select>
            <input type="text" id="ai_model_custom" placeholder="手动输入模型名">
          </div>
          <div class="settings-footer">
            <button id="save_settings" style="background:blue;">保存并关闭</button>
            <button id="close_settings" style="background:#999;">取消</button>
          </div>
      </div>

      <div class="n_footer">
        <button id="n_setting">AI配置</button>
        <button id="n_clear">清除缓存</button>
        <button id="n_button">开始刷课</button>
      </div>
    </div>
  `);
  doc.close();

  return {
    iframe,
    doc,
    panel: doc.getElementById('n_panel'),
    header: doc.getElementById('n_header'),
    button: doc.getElementById('n_button'),
    clear: doc.getElementById('n_clear'),
    settingBtn: doc.getElementById('n_setting'),
    settingsPanel: doc.getElementById('n_settings_panel'),
    saveSettingsBtn: doc.getElementById('save_settings'),
    closeSettingsBtn: doc.getElementById('close_settings'),
    aiProviderSelect: doc.getElementById('ai_provider'),
    aiUrlInput: doc.getElementById('ai_url'),
    aiKeyInput: doc.getElementById('ai_key'),
    aiModelSelect: doc.getElementById('ai_model_select'),
    aiModelCustom: doc.getElementById('ai_model_custom'),
    fetchModelsBtn: doc.getElementById('fetch_models_btn'),
    infoAlert: doc.getElementById('n_infoAlert'),
    minimality: doc.getElementById('minimality'),
    question: doc.getElementById('question'),
    miniBasic: doc.getElementById('mini-basic')
  };
}

function addUserOperate() {
  const { iframe, doc, panel, header, button, clear, settingBtn, settingsPanel, saveSettingsBtn, closeSettingsBtn, aiProviderSelect, aiUrlInput, aiKeyInput, aiModelSelect, aiModelCustom, fetchModelsBtn, infoAlert, minimality, question, miniBasic } = addWindow();

  // 服务商预设
  const PROVIDERS = {
    deepseek:  { chatUrl: 'https://api.deepseek.com/v1/chat/completions',                                              modelsUrl: 'https://api.deepseek.com/v1/models',                                    defaultModels: ['deepseek-chat','deepseek-reasoner'] },
    moonshot:  { chatUrl: 'https://api.moonshot.cn/v1/chat/completions',                                               modelsUrl: 'https://api.moonshot.cn/v1/models',                                     defaultModels: ['moonshot-v1-8k','moonshot-v1-32k','moonshot-v1-128k'] },
    dashscope: { chatUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',                        modelsUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',             defaultModels: ['qwen-plus','qwen-max','qwen-turbo','qwen-long'] },
    openai:    { chatUrl: 'https://api.openai.com/v1/chat/completions',                                                modelsUrl: 'https://api.openai.com/v1/models',                                      defaultModels: ['gpt-4o','gpt-4o-mini','gpt-3.5-turbo'] },
    gemini:    { chatUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',  modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',              defaultModels: ['gemini-2.0-flash','gemini-2.0-flash-lite','gemini-1.5-pro','gemini-1.5-flash'] },
    custom:    { chatUrl: '', modelsUrl: '', defaultModels: [] }
  };

  function getProviderFromUrl(url) {
    if (!url) return 'custom';
    if (url.includes('deepseek.com')) return 'deepseek';
    if (url.includes('moonshot.cn')) return 'moonshot';
    if (url.includes('dashscope.aliyuncs.com')) return 'dashscope';
    if (url.includes('openai.com')) return 'openai';
    if (url.includes('googleapis.com')) return 'gemini';
    return 'custom';
  }

  function populateModelSelect(models, selectedModel) {
    aiModelSelect.innerHTML = '';
    models.forEach(function(m) {
      const opt = doc.createElement('option');
      opt.value = m; opt.textContent = m;
      aiModelSelect.appendChild(opt);
    });
    const customOpt = doc.createElement('option');
    customOpt.value = '__custom__'; customOpt.textContent = '手动输入...';
    aiModelSelect.appendChild(customOpt);
    if (selectedModel && models.includes(selectedModel)) {
      aiModelSelect.value = selectedModel;
      aiModelCustom.style.display = 'none';
    } else if (selectedModel) {
      aiModelSelect.value = '__custom__';
      aiModelCustom.value = selectedModel;
      aiModelCustom.style.display = 'block';
    }
  }

  function applyProvider(provider, keepUrl) {
    const preset = PROVIDERS[provider] || PROVIDERS.custom;
    if (provider === 'custom') {
      aiUrlInput.readOnly = false;
      aiUrlInput.style.background = '';
      if (!keepUrl) aiUrlInput.value = '';
    } else {
      aiUrlInput.readOnly = true;
      aiUrlInput.style.background = '#f5f5f5';
      aiUrlInput.value = preset.chatUrl;
    }
    const cur = aiModelSelect.value === '__custom__' ? aiModelCustom.value : aiModelSelect.value;
    populateModelSelect(preset.defaultModels, cur);
  }

  aiProviderSelect.onchange = function() { applyProvider(this.value, false); };

  aiModelSelect.onchange = function() {
    if (this.value === '__custom__') {
      aiModelCustom.style.display = 'block';
    } else {
      aiModelCustom.style.display = 'none';
      if (aiProviderSelect.value === 'gemini' && this.value) {
        aiUrlInput.value = 'https://generativelanguage.googleapis.com/v1beta/models/' + this.value + ':generateContent';
      }
    }
  };

  fetchModelsBtn.onclick = function() {
    const provider = aiProviderSelect.value;
    const key = aiKeyInput.value.trim();
    if (!key) { doc.defaultView.alert('请先填写 API KEY'); return; }
    const preset = PROVIDERS[provider] || PROVIDERS.custom;
    let modelsUrl = preset.modelsUrl || aiUrlInput.value.trim().replace(/\/chat\/completions.*$/, '/models');
    if (!modelsUrl) { doc.defaultView.alert('无法确定模型列表地址'); return; }
    fetchModelsBtn.textContent = '获取中...';
    fetchModelsBtn.disabled = true;
    const isGemini = provider === 'gemini';
    const currentModel = aiModelSelect.value === '__custom__' ? aiModelCustom.value : aiModelSelect.value;
    GM_xmlhttpRequest({
      method: 'GET',
      url: isGemini ? modelsUrl + '?key=' + key : modelsUrl,
      headers: isGemini ? {} : { 'Authorization': 'Bearer ' + key },
      timeout: 12000,
      onload: function(resp) {
        fetchModelsBtn.textContent = '获取列表';
        fetchModelsBtn.disabled = false;
        if (resp.status === 200) {
          try {
            const data = JSON.parse(resp.responseText);
            let models = [];
            if (isGemini && data.models) {
              models = data.models
                .filter(function(m){ return m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'); })
                .map(function(m){ return m.name.replace('models/', ''); });
            } else if (data.data) {
              models = data.data.map(function(m){ return m.id; }).filter(Boolean);
            } else if (data.models) {
              models = data.models.map(function(m){ return m.id || m.name; }).filter(Boolean);
            }
            if (models.length > 0) {
              populateModelSelect(models, currentModel);
              $.alertMessage('✅ 获取到 ' + models.length + ' 个模型');
            } else {
              doc.defaultView.alert('未获取到模型列表，请检查 Key 或网络');
            }
          } catch(e) {
            doc.defaultView.alert('解析失败: ' + e.message);
          }
        } else {
          doc.defaultView.alert('获取失败: HTTP ' + resp.status + (resp.status===401?' (Key无效)':resp.status===403?' (无权限)':''));
        }
      },
      onerror: function() { fetchModelsBtn.textContent='获取列表'; fetchModelsBtn.disabled=false; doc.defaultView.alert('网络错误'); },
      ontimeout: function() { fetchModelsBtn.textContent='获取列表'; fetchModelsBtn.disabled=false; doc.defaultView.alert('请求超时'); }
    });
  };

  function loadSettings() {
    const saved = window.parent.getAIConf ? window.parent.getAIConf() : getAIConf();
    const provider = saved.provider || getProviderFromUrl(saved.url);
    aiProviderSelect.value = (PROVIDERS[provider] ? provider : 'custom');
    aiKeyInput.value = saved.key || '';
    applyProvider(aiProviderSelect.value, true);
    if (aiProviderSelect.value === 'custom') aiUrlInput.value = saved.url || '';
    populateModelSelect((PROVIDERS[aiProviderSelect.value] || PROVIDERS.custom).defaultModels, saved.model || '');
  }
  loadSettings();

  settingBtn.onclick = function() { loadSettings(); settingsPanel.style.display = 'block'; };
  closeSettingsBtn.onclick = function() { settingsPanel.style.display = 'none'; };
  saveSettingsBtn.onclick = function() {
    const provider = aiProviderSelect.value;
    const key = aiKeyInput.value.trim();
    let url = aiUrlInput.value.trim();
    let model = aiModelSelect.value === '__custom__' ? aiModelCustom.value.trim() : aiModelSelect.value;
    if (provider === 'gemini' && model && !url.includes(model)) {
      url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
    }
    if (!url || !key || !model) { doc.defaultView.alert('请填写完整的 URL、Key 和模型！'); return; }
    const newConf = { provider, url, key, model };
    if (window.parent.saveAIConf) { window.parent.saveAIConf(newConf); } else { saveAIConf(newConf); }
    settingsPanel.style.display = 'none';
    $.alertMessage('✅ AI配置已保存！');
  };

  // --- 原有的拖拽和功能逻辑保持不变 ---

  // 拖拽功能
  let isDragging = false;
  let startScreenX = 0, startScreenY = 0;
  let startLeft = 0, startTop = 0;
  const hostWindow = window.parent || window; // parent 捕获能拿到在 iframe 外的鼠标事件

  const handleMove = function (e) {
    if (!isDragging) return;
    const deltaX = e.screenX - startScreenX;
    const deltaY = e.screenY - startScreenY;
    const maxLeft = Math.max(0, hostWindow.innerWidth - iframe.offsetWidth);
    const maxTop = Math.max(0, hostWindow.innerHeight - iframe.offsetHeight);
    iframe.style.left = Math.min(Math.max(0, startLeft + deltaX), maxLeft) + 'px';
    iframe.style.top = Math.min(Math.max(0, startTop + deltaY), maxTop) + 'px';
  };

  const stopDrag = function () {
    if (!isDragging) return;
    isDragging = false;
    iframe.style.transition = '';
    doc.body.style.userSelect = '';
  };

  header.addEventListener('mousedown', function (e) {
    isDragging = true;
    startScreenX = e.screenX;
    startScreenY = e.screenY;
    startLeft = parseFloat(iframe.style.left) || 0;
    startTop = parseFloat(iframe.style.top) || 0;
    iframe.style.transition = 'none';
    doc.body.style.userSelect = 'none';
    e.preventDefault();
  });

  doc.addEventListener('mousemove', handleMove);
  hostWindow.addEventListener('mousemove', handleMove);
  doc.addEventListener('mouseup', stopDrag);
  hostWindow.addEventListener('mouseup', stopDrag);
  hostWindow.addEventListener('blur', stopDrag);

  // 最小化/放大
  const normalSize = {
    width: parseFloat(iframe.style.width) || 500,
    height: parseFloat(iframe.style.height) || 300
  };
  const miniSize = 64;
  let isMinimized = false;

  const enterMini = function () {
    if (isMinimized) return;
    isMinimized = true;
    panel.style.display = 'none';
    miniBasic.classList.add('show');
    iframe.style.width = miniSize + 'px';
    iframe.style.height = miniSize + 'px';
  };

  const exitMini = function () {
    if (!isMinimized) return;
    isMinimized = false;
    panel.style.display = '';
    miniBasic.classList.remove('show');
    iframe.style.width = normalSize.width + 'px';
    iframe.style.height = normalSize.height + 'px';
  };

  minimality.addEventListener('click', enterMini);
  miniBasic.addEventListener('click', exitMini);

  // 有问题按钮
  question.addEventListener('click', function () {
    window.parent.alert('如遇问题请自行检查配置/网络环境。');
  });

  // 刷课按钮
  button.onclick = function () {
    window.parent.start && window.parent.start();
    button.innerText = '刷课中~';
  };
  // 清除数据按钮
  clear.onclick = function () {
    window.parent.$.userInfo.removeProgress(window.parent.location.href);
    window.parent.localStorage.removeItem('pro_lms_classCount');
  };

  // 自动滚动消息
  (function () {
    let scrollTimer;
    scrollTimer = setInterval(function () {
      if (infoAlert.lastElementChild) infoAlert.lastElementChild.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
    }, 500)
    infoAlert.addEventListener('mouseenter', () => { clearInterval(scrollTimer); })
    infoAlert.addEventListener('mouseleave', () => {
      scrollTimer = setInterval(function () {
        if (infoAlert.lastElementChild) infoAlert.lastElementChild.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
      }, 500)
    })
  })();

  // 重定向 alertMessage
  $.panel = panel;
  $.alertMessage = function (message) {
    const li = doc.createElement('li');
    li.innerText = message;
    infoAlert.appendChild(li);
  };
}

function start() {  // 脚本入口函数
  const url = location.host;
  const pathName = location.pathname.split('/');
  const matchURL = url + pathName[0] + '/' + pathName[1] + '/' + pathName[2];
  if (url.includes('examination.xuetangx.com')) {
    xuetang_exam();
    return;
  }
  $.alertMessage(`正在为您匹配${matchURL}的处理逻辑...`);
  if (matchURL.includes('yuketang.cn/v2/web') || matchURL.includes('gdufemooc.cn/v2/web')) {
    yuketang_v2();
  } else if (matchURL.includes('yuketang.cn/pro/lms') || matchURL.includes('gdufemooc.cn/pro/lms')) {
    yuketang_pro_lms();
  } else {
    $.panel.querySelector("button").innerText = "开始刷课";
    $.alertMessage(`这不是刷课的页面哦，刷课页面的网址应该匹配 */v2/web/* 或 */pro/lms/*`)
    return false;
  }
}
window.$ = $;
window.start = start;
// yuketang.cn/v2/web页面的处理逻辑
function yuketang_v2() {
  const baseUrl = location.href;    // 用于判断不同的课程
  let count = $.userInfo.getProgress(baseUrl).outside;  // 记录当前课程播放的外层集数
  let play = true;        // 用于标记视频是否播放完毕
  $.alertMessage(`检测到已经播放到${count}集...`);
  $.alertMessage('已匹配到yuketang.cn/v2/web,正在处理...');
  // 主函数
  function main() {
    autoSlide(count).then(() => {
      const listRoot = document.querySelector('.logs-list');
      if (!listRoot) {
        $.alertMessage('⚠️ 未找到课程列表，稍后重试');
        setTimeout(main, 2000);
        return;
      }
      const list = Array.from(listRoot.childNodes).filter(node => node.nodeType === 1);   // 保存当前课程的所有外层集数
      if (count >= list.length) {
        $.alertMessage('课程刷完了');
        $.panel.querySelector('#n_button').innerText = '刷完了~';
        $.userInfo.removeProgress(baseUrl);
        return;
      }
      const courseWrapper = list[count];
      const course = courseWrapper.querySelector('.content-box')?.querySelector('section');   // 保存当前课程dom结构
      if (!course) {
        $.alertMessage('⚠️ 未找到课程内容节点，跳过该条目');
        count++;
        $.userInfo.setProgress(baseUrl, count);
        setTimeout(main, 500);
        return;
      }
      let classInfo = course.querySelector('.tag')?.querySelector('use')?.getAttribute('xlink:href') || 'piliang'; // 2023.11.23 雨课堂更新，去掉了批量字样,所有如果不存在就默认为批量课程

      // 【优化】提前在列表页检测完成状态，适用于所有类型
      if (isTaskCompletedInList(courseWrapper)) {
        const taskType = classInfo.includes('shipin') ? '视频' :
                        classInfo.includes('tuwen') ? '图文' :
                        classInfo.includes('taolun') ? '讨论' :
                        classInfo.includes('zuoye') ? '作业' :
                        classInfo.includes('kaoshi') ? '考试' : '任务';
        $.alertMessage(`✓ ${taskType}已完成，跳过第${count + 1}个`);
        count++;
        $.userInfo.setProgress(baseUrl, count);
        setTimeout(main, 500);
        return;
      }
      $.alertMessage('刷课状态：第' + (count + 1) + '个/' + list.length + '个');
      // $.alertMessage('类型[' + classInfo + '] 第' + (count + 1) + '/' + list.length + '个');

      if (count === list.length && play === true) {            // 结束
        $.alertMessage('课程刷完了');
        $.panel.querySelector('#n_button').innerText = '刷完了~';
        $.userInfo.removeProgress(baseUrl);
        return;
      } else if (classInfo?.includes('shipin') && play === true) { // 视频处理
        play = false;
        course.click(); // 进入课程
        setTimeout(() => {
          let progress = document.querySelector('.progress-wrap').querySelector('.text');   // 课程进度
          let deadline = false;   // 课程是否到了截止日期
          const title = document.querySelector(".title").innerText;   // 课程标题
          $.alertMessage(`正在播放：${title}`);
          if (document.querySelector('.box').innerText.includes('已过考核截止时间')) {
            deadline = true;
            $.alertMessage(`${title}已经过了截至日期，进度不再增加，将跳过~`);
          }
          $.ykt_speed();
          $.claim();
          $.observePause();
          let timer1 = setInterval(() => {
            // console.log(progress);
            if (progress.innerHTML.includes('100%') || progress.innerHTML.includes('99%') || progress.innerHTML.includes('98%') || progress.innerHTML.includes('已完成') || deadline) {
              count++;
              $.userInfo.setProgress(baseUrl, count);
              play = true;
              if (!!$.observer) {         // 防止oberver为undefined(网速卡导致视频没加载出来，observer为空)
                $.observer.disconnect();  // 视频播放完了，停止监听
              }
              history.back();
              main();
              clearInterval(timer1);
            }
          }, 10000);
        }, 3000)
        // 批量处理
      } else if (classInfo?.includes('piliang') && play === true) {   // 批量处理
        let zhankai = course.querySelector('.sub-info').querySelector('.gray').querySelector('span');
        sync();
        async function sync() {
          await zhankai.click();
          setTimeout(() => {
            // 保存所有视频
            let a = list[count].querySelector('.leaf_list__wrap').querySelectorAll('.activity__wrap');
            let count1 = $.userInfo.allInfo[baseUrl].inside;     // 保存内部集数
            $.alertMessage('第' + (count + 1) + '个：进入了批量区');
            bofang();
            function bofang() {
              let play = true;
              let classInfo1;
              let videotitle, audiotitle;
              if (count1 === a.length && play === true) {
                $.alertMessage('合集播放完毕');
                count++;
                $.userInfo.setProgress(baseUrl, count);
                main();
              }
              console.log(a[count1]?.querySelector('.tag').innerText);

              // 【优化】使用增强的完成检测，避免进入详情页
              if (isTaskCompletedInList(a[count1])) {
                const subType = a[count1]?.querySelector('.tag')?.innerText || '子任务';
                $.alertMessage(`✓ ${subType}已完成，跳过批量内第${count1 + 1}个`);
                count1++;
                $.userInfo.setProgress(baseUrl, count, count1);
                setTimeout(() => { bofang(); }, 200);
                return;
              }
              if (a[count1]?.querySelector('.tag').innerText === '音频') {
                classInfo1 = "音频";
                audiotitle = a[count1]?.querySelector("h2").innerText;
              } else {    // 不是音频
                classInfo1 = a[count1]?.querySelector('.tag').querySelector('use').getAttribute('xlink:href');
                videotitle = a[count1].querySelector("h2").innerText;
                console.log(classInfo1);

              }
              // $.alertMessage('批量中[' + classInfo1 + ']'); // 查找进入批量操作之后所有的类型
              if (classInfo1 == "音频" && play === true) {
                play = false;
                a[count1].click();
                $.alertMessage(`开始播放:${audiotitle}`);
                setTimeout(() => {
                  $.audioDetail();
                }, 3000);
                let timer = setInterval(() => {
                  let progress = document.querySelector('.progress-wrap').querySelector('.text');
                  if (document.querySelector('audio').paused) {
                    document.querySelector('audio').play();
                  }
                  if (progress.innerHTML.includes('100%') || progress.innerHTML.includes('99%') || progress.innerHTML.includes('98%') || progress.innerHTML.includes('已完成')) {
                    count1++;
                    $.userInfo.setProgress(baseUrl, count, count1);
                    clearInterval(timer);
                    $.alertMessage(`${audiotitle}播放完毕`);
                    history.back();
                    setTimeout(() => {
                      bofang();
                    }, 2000);
                  }
                }, 3000)
              } else if (classInfo1?.includes('shipin') && play === true) { // #icon-shipin
                play = false;
                a[count1].click();
                $.alertMessage(`开始播放:${videotitle}`);
                // 延迟3秒后加速
                setTimeout(() => {
                  $.ykt_speed();
                  $.claim();
                  $.observePause();
                }, 3000);
                let timer = setInterval(() => {
                  let progress = document.querySelector('.progress-wrap').querySelector('.text');
                  if (progress.innerHTML.includes('100%') || progress.innerHTML.includes('99%') || progress.innerHTML.includes('98%') || progress.innerHTML.includes('已完成')) {
                    count1++;
                    $.userInfo.setProgress(baseUrl, count, count1);
                    clearInterval(timer);
                    $.alertMessage(`${videotitle}播放完毕`);
                    if (!!$.observer) {         // 防止oberver为undefined.
                      $.observer.disconnect();  // 视频播放完了，停止监听
                    }
                    history.back();
                    setTimeout(() => {
                      bofang();
                    }, 2000);
                  }
                }, 3000)
              } else if ((classInfo1?.includes('tuwen') || classInfo1?.includes('taolun')) && play === true) { // #icon-tuwen
                  play = false;
                  a[count1].click(); // 进入详情页

                  // 获取标题用于提示当前处理是图文或者讨论
                  const typeText = classInfo1.includes('tuwen') ? '图文' : '讨论';
                  const titleText = a[count1]?.querySelector('h2')?.innerText || '';
                  $.alertMessage(`开始处理${typeText}: ${titleText}`);

                  (async function () {
                      // 1. 初始等待，并让页面向下滚动以触发加载
                      $.alertMessage('页面加载中，正在等待评论区刷新...');
                      window.scrollTo(0, document.body.scrollHeight); // 滚到底部触发加载
                      await new Promise(r => setTimeout(r, 1000));
                      window.scrollTo(0, 0); // 滚回顶部（可选，防止找不到元素）

                      // 2. 定义评论区的选择器（修正后的）
                      const commentCandidates = [
                          '#new_discuss .new_discuss_list .cont_detail',
                          '.new_discuss_list dd .cont_detail',
                          '.cont_detail.word-break'
                      ];
                      // 3. 【关键修改】轮询检测评论，最多等待 15 秒
                      let firstCommentText = '';
                      let maxRetries = 30; // 30次 * 500ms = 15秒

                      while (maxRetries > 0) {
                          for (const sel of commentCandidates) {
                              const list = document.querySelectorAll(sel);
                              if (list && list.length > 0) {
                                  for (const it of list) {
                                      // 找到内容不为空的评论
                                      if (it && it.innerText && it.innerText.trim().length > 0) {
                                          firstCommentText = it.innerText.trim();
                                          break;
                                      }
                                  }
                              }
                              if (firstCommentText) break;
                          }

                          if (firstCommentText) {
                              break; // 找到了，跳出循环
                          } else {
                              // 没找到，等待 500ms 后重试
                              maxRetries--;
                              if (maxRetries % 4 === 0) $.alertMessage(`等待评论加载... 剩余重试 ${maxRetries} 次`); // 偶尔提示一下
                              await new Promise(r => setTimeout(r, 500));
                          }
                      }

                      // 4. 最终检查是否获取到评论
                      if (!firstCommentText) {
                          $.alertMessage(`超时未找到评论内容，跳过该条${typeText}`);
                          count1++;
                          $.userInfo.setProgress(baseUrl, count, count1);
                          history.back();
                          setTimeout(() => { bofang(); }, 1200);
                          return;
                      } else {
                          $.alertMessage(`获取成功: ${firstCommentText.substring(0, 10)}...`);
                      }

                      // 5. 查找输入框
                      const inputSelectors = [
                          '.el-textarea__inner',
                          'textarea.el-textarea__inner'
                      ];
                      let inputEl = null;
                      // 同样稍微等待一下输入框（通常评论出来输入框也就出来了，简单查即可）
                      for (const sel of inputSelectors) {
                          const tmp = document.querySelector(sel);
                          if (tmp) { inputEl = tmp; break; }
                      }

                      if (!inputEl) {
                          $.alertMessage('未找到评论输入框，跳过');
                          count1++;
                          $.userInfo.setProgress(baseUrl, count, count1);
                          history.back();
                          setTimeout(() => { bofang(); }, 1200);
                          return;
                      }

                      // 6. 填入内容并触发事件
                      try {
                          inputEl.value = firstCommentText;
                          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                          inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                          inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true })); // 模拟键盘事件激活按钮
                      } catch (e) { console.warn(e); }

                      // 等待按钮激活
                      await new Promise(r => setTimeout(r, 800));

                      // 7. 点击发送
                      const sendCandidates = [
                          '.el-button.submitComment',
                          '.publish_discuss .postBtn button',
                          '.el-button--primary'
                      ];
                      let sent = false;
                      for (const s of sendCandidates) {
                          const btn = document.querySelector(s);
                          // 检查按钮是否存在，并且没有 'is-disabled' 类，且 disabled 属性为 false
                          if (btn && !btn.disabled && !btn.classList.contains('is-disabled') && !btn.closest('.is-disabled')) {
                              btn.click();
                              sent = true;
                              break;
                          }
                      }

                      if(sent) {
                          $.alertMessage(`已在${typeText}区发表评论`);
                      } else {
                          $.alertMessage('发送按钮仍不可用或未找到');
                      }

                      // 8. 等待发送完成并返回
                      await new Promise(r => setTimeout(r, 1500));
                      count1++;
                      $.userInfo.setProgress(baseUrl, count, count1);
                      history.back();
                      setTimeout(() => { bofang(); }, 1000);

                  })();
                } else if (classInfo1?.includes('zuoye') && play === true) { // #icon-zuoye
                play = false;
                a[count1].click(); // 进入作业页面

                (async function () {
                  let success = false;
                  try {
                    await new Promise(r => setTimeout(r, 1500));
                    await solveAssessment({ label: '作业' });
                    success = true;
                  } catch (err) {
                    $.alertMessage(`作业处理失败: ${err.message || err}`);
                  }
                  play = true;
                  if (success) {
                    count1++;
                    $.userInfo.setProgress(baseUrl, count, count1);
                    history.back();
                    setTimeout(() => { bofang(); }, 1000);
                  } else {
                    $.panel.querySelector('#n_button').innerText = '待处理作业';
                    $.alertMessage('作业未完成，请手动处理后重新开始');
                  }
                })();
                } else if (classInfo1?.includes('kaoshi') && play === true) { // #icon-kaoshi
                play = false;
                a[count1].click();
                $.alertMessage('进入考试测验，尝试AI作答');

                (async function () {
                  let success = false;
                  try {
                    await new Promise(r => setTimeout(r, 1500));
                    await solveAssessment({ label: '考试' });
                    success = true;
                  } catch (err) {
                    $.alertMessage(`考试处理失败: ${err.message || err}`);
                  }
                  play = true;
                  if (success) {
                    count1++;
                    $.userInfo.setProgress(baseUrl, count, count1);
                    history.back();
                    setTimeout(() => { bofang(); }, 1000);
                  } else {
                    $.panel.querySelector('#n_button').innerText = '待处理考试';
                    $.alertMessage('考试未完成，请手动处理后重新开始');
                  }
                })();
              } else if (classInfo1 && !classInfo1.includes('shipin') && !classInfo1.includes('tuwen') && !classInfo1.includes('taolun') && !classInfo1.includes('zuoye') && !classInfo1.includes('kaoshi') && play === true) {
                $.alertMessage('不是视频、图文、讨论、作业或考试，跳过');
                count1++;
                $.userInfo.setProgress(baseUrl, count, count1);
                bofang();
              }
            }
          }, 2000)
        }
      } else if (classInfo?.includes('zuoye') && play === true) {   // 顶层作业
        play = false;
        course.click();
        $.alertMessage(`第${count + 1}个：进入作业区`);

        (async function () {
          let success = false;
          try {
            await new Promise(r => setTimeout(r, 1500));
            await solveAssessment({ label: '作业' });
            success = true;
          } catch (err) {
            $.alertMessage(`作业处理失败: ${err.message || err}`);
          }
          play = true;
          if (success) {
            count++;
            $.userInfo.setProgress(baseUrl, count);
            history.back();
            setTimeout(() => { main(); }, 1000);
          } else {
            $.panel.querySelector('#n_button').innerText = '待处理作业';
            $.alertMessage('作业未完成，请手动处理后重新开始');
          }
        })();
      } else if (classInfo?.includes('ketang') && play === true) {    // 课堂处理
        $.alertMessage('第' + (count + 1) + '个：进入了课堂区');
        play = false;
        course.click();
        setTimeout(() => {

          async function waitForVideoEnd(video) {
            return new Promise((resolve) => {
              if (video.ended) return resolve();
              video.addEventListener("ended", () => {
                $.alertMessage("课堂视频看完了~")
                resolve()
              }, { once: true });
            });
          }

          async function waitForAudioEnd(audio) {
            return new Promise((resolve) => {
              if (audio.ended) return resolve();
              audio.addEventListener("ended", () => resolve(), { once: true });
            });
          }

          async function mainFlow() {
            //  !!! documen获取不到内嵌的iframe框架里面的dom，浪费了我好长时间来测试，特此记录
            video = document.querySelector('iframe.lesson-report-mobile').contentDocument.querySelector("video");
            audio = document.querySelector('iframe.lesson-report-mobile').contentDocument.querySelector("audio");

            if (video) {
              $.videoDetail(video);
              $.alertMessage("获取到video");
              await waitForVideoEnd(video);
            }
            if (audio) {
              $.alertMessage("获取到audio");
              $.audioDetail(audio);
              await waitForAudioEnd(audio);
            }
            console.log("没有视频或音频了");
            count++;
            $.userInfo.setProgress(baseUrl, count);
            play = true;
            history.go(-1);
            main();

          }
          mainFlow();
        }, 5000)
      } else if (classInfo?.includes('kejian') && play === true) {  // 课件处理
        const tableDate = course.parentNode.parentNode.parentNode.__vue__.tableData;
        console.log(tableDate.deadline, tableDate.end);
        if ((tableDate.deadline || tableDate.end) ? (tableDate.deadline < Date.now() || tableDate.end < Date.now()) : false) {  // 没有该属性默认没有结课
          $.alertMessage('第' + (count + 1) + '个：' + course.childNodes[0].childNodes[2].childNodes[0].innerText + '课件结课了，已跳过');
          count++;
          $.userInfo.setProgress(baseUrl, count);
          main();
        } else {
          // $.alertMessage('根据ycj用户的反馈修改新增课件处理，且赞助支持，表示感谢') // 8.8元
          $.alertMessage('第' + (count + 1) + '个：进入了课件区');
          play = false;
          console.log();
          course.click();
          let classType;
          (async function () {
            await new Promise(function (resolve) {
              setTimeout(function () {
                classType = document.querySelector('.el-card__header').innerText;
                console.log(classType);
                document.querySelector('.check').click();
                resolve();
              }, 3000)
            })  // 3秒后执行点击事件
            let className = document.querySelector('.dialog-header').firstElementChild.innerText;
            console.log(className);
            if (classType == '课件PPT') {  // 课件为ppt
              let allPPT = document.querySelector('.swiper-wrapper').children;
              let pptTime = basicConf.pptTime || 3000;
              $.alertMessage(`开始播放${className}`)
              for (let i = 0; i < allPPT.length; i++) {
                await new Promise(function (resolve) {
                  setTimeout(function () {
                    allPPT[i].click();
                    $.alertMessage(`${className}：第${i + 1}个ppt已经播放`);
                    resolve();
                  }, pptTime)
                })
              }
              await new Promise(function (resolve) {  // 稍微等待
                setTimeout(function () {
                  resolve();
                }, pptTime) // 最后一张ppt等待时间
              })
              if (document.querySelector('.video-box')) {  // 回头检测如果ppt里面有视频
                let pptVideo = document.querySelectorAll('.video-box');
                $.alertMessage('检测到ppt里面有视频，将继续播放视频');
                for (let i = 0; i < pptVideo.length; i++) {
                  if (document.querySelectorAll('.video-box')[i].innerText != '已完成') {   // 判断视频是否已播放
                    pptVideo[i].click();
                    $.alertMessage(`开始播放：${className}里面的第${i + 1}个视频`)
                    await new Promise(function (resolve) {
                      setTimeout(function () {
                        $.ykt_speed();  // 加速
                        document.querySelector('.xt_video_player_common_icon').click();  // 静音
                        $.observePause(); // 防止切屏自动暂停
                        resolve();
                      }, 3000)
                    })
                    await new Promise(function (resolve) {
                      let timer = setInterval(function () {
                        let allTime = document.querySelector('.xt_video_player_current_time_display').innerText;
                        nowTime = allTime.split(' / ')[0];
                        totalTime = allTime.split(' / ')[1]
                        console.log(nowTime + totalTime);
                        if (nowTime == totalTime) {
                          clearInterval(timer);
                          if (!!$.observer) {  // 防止新的视频已经播放完了，还未来得及赋值observer的问题
                            $.observer.disconnect();  // 停止监听
                          }
                          resolve();
                        }
                      }, 200);
                    })  // 等待视频结束
                  } else {  // 视频已完成
                    $.alertMessage(`检测到${className}里面的第${i + 1}个视频已经播放完毕`);
                  }
                }
              }
              $.alertMessage(`${className} 已经播放完毕`)
            } else {  // 课件为视频
              document.querySelector('.video-box').click();
              $.alertMessage(`开始播放视频：${className}`);
              await new Promise(function (resolve) {
                setTimeout(function () {
                  $.ykt_speed();
                  document.querySelector('.xt_video_player_common_icon').click();
                  resolve();
                }, 3000)
              })  // 3秒后加速,静音
              await new Promise(function (resolve) {
                let timer = setInterval(function () {
                  let allTime = document.querySelector('.xt_video_player_current_time_display').innerText;
                  let nowTime = allTime.split(' / ')[0];
                  let totalTime = allTime.split(' / ')[1]
                  console.log(nowTime + totalTime);
                  if (nowTime == totalTime) {
                    clearInterval(timer);
                    resolve();
                  }
                }, 200);
              })  // 等待视频结束
              $.alertMessage(`${className} 视频播放完毕`)
            }
            count++;
            $.userInfo.setProgress(baseUrl, count);
            play = true;
            history.back();
            main();
          })()
        }
      } else if (classInfo?.includes('kaoshi') && play === true) {
        const examCardText = (course?.parentElement?.innerText || '').replace(/\s+/g, '');
        if (/(得分|已交卷|查看试卷|成绩)/.test(examCardText)) {
          $.alertMessage(`第${count + 1}个考试已存在成绩，自动跳过`);
          count++;
          $.userInfo.setProgress(baseUrl, count);
          main();
          return;
        }
        play = false;
        course.click();
        $.alertMessage(`第${count + 1}个：进入考试区`);

        (async function () {
          let success = false;
          try {
            await new Promise(r => setTimeout(r, 1500));
            await solveAssessment({ label: '考试' });
            success = true;
          } catch (err) {
            $.alertMessage(`考试处理失败: ${err.message || err}`);
          }
          play = true;
          if (success) {
            count++;
            $.userInfo.setProgress(baseUrl, count);
            history.back();
            setTimeout(() => { main(); }, 1000);
          } else {
            $.panel.querySelector('#n_button').innerText = '待处理考试';
            $.alertMessage('考试未完成，请手动处理后重新开始');
          }
        })();
      } else if (!(classInfo.includes('shipin') || classInfo.includes('piliang') || classInfo.includes('kejian') || classInfo.includes('kaoshi') || classInfo.includes('zuoye')) && play === true) { // 视频，批量，课件都不是的时候跳过，此处可以优化
        $.alertMessage('第' + (count + 1) + '个：不是视频，批量，课件，考试或作业，已跳过');
        count++;
        $.userInfo.setProgress(baseUrl, count);
        main();
      }
    })
  }
  // 根据视频集数，自动下拉刷新集数
  async function autoSlide(count) {
    let frequency = parseInt((count + 1) / 20) + 1;
    for (let i = 0; i < frequency; i++) {
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          document.querySelector('.viewContainer').scrollTop = document.querySelector('.el-tab-pane').scrollHeight;
          resolve();
        }, 1000)
      })
    }
  }
  main();
}

// yuketang.cn/pro/lms旧页面的跳转逻辑
function yuketang_pro_lms() {
  localStorage.setItem('n_type', true);
  $.alertMessage('正准备打开新标签页...');
  localStorage.getItem('pro_lms_classCount') ? null : localStorage.setItem('pro_lms_classCount', 1);  // 初始化集数
  let classCount = localStorage.getItem('pro_lms_classCount') - 1;
  let leafDetail = document.querySelectorAll('.leaf-detail');     // 课程列表
  while (!leafDetail[classCount].firstChild.querySelector('i').className.includes('shipin')) {
    classCount++;
    localStorage.setItem('pro_lms_classCount', classCount);
    $.alertMessage('课程不属于视频，已跳过^_^');
  };
  document.querySelectorAll('.leaf-detail')[classCount].click();  // 进入第一个【视频】课程，启动脚本
}

// yuketang.cn/pro/lms新页面的刷课逻辑
function yuketang_pro_lms_new() {
  $.preventScreenCheck();
  function nextCount(classCount) {
    event1 = new Event('mousemove', { bubbles: true });
    event1.clientX = 9999;
    event1.clientY = 9999;
    if (document.querySelector('.btn-next')) {
      localStorage.setItem('pro_lms_classCount', classCount);
      document.querySelector('.btn-next').dispatchEvent(event1);
      document.querySelector('.btn-next').dispatchEvent(new Event('click'));
      localStorage.setItem('n_type', true);
      main();
    } else {
      localStorage.removeItem('pro_lms_classCount');
      $.alertMessage('课程播放完毕了');
    }
  }
  $.alertMessage('已就绪，开始刷课，请尽量保持页面不动。');
  let classCount = localStorage.getItem('pro_lms_classCount');
  async function main() {
    $.alertMessage(`准备播放第${classCount}集...`);
    await new Promise(function (resolve) {
      setTimeout(function () {
        let className = document.querySelector('.header-bar').firstElementChild.innerText;
        let classType = document.querySelector('.header-bar').firstElementChild.firstElementChild.getAttribute('class');
        let classStatus = document.querySelector('#app > div.app_index-wrapper > div.wrap > div.viewContainer.heightAbsolutely > div > div > div > div > section.title')?.lastElementChild?.innerText;
        if (classType.includes('tuwen') && classStatus != '已读') {
          $.alertMessage(`正在废寝忘食地看:${className}中...`);
          setTimeout(() => {
            resolve();
          }, 2000)
        } else if (classType.includes('taolun')) {
          $.alertMessage(`只是看看，目前没有自动发表讨论功能，欢迎反馈...`);
          setTimeout(() => {
            resolve();
          }, 2000)
        } else if (classType.includes('shipin') && !classStatus.includes('100%')) {
          $.alertMessage(`7s后开始播放：${className}`);
          setTimeout(() => {
            // 监测视频播放状态
            let timer = setInterval(() => {
              let classStatus = document.querySelector('#app > div.app_index-wrapper > div.wrap > div.viewContainer.heightAbsolutely > div > div > div > div > section.title')?.lastElementChild?.innerText;
              if (classStatus.includes('100%') || classStatus.includes('99%') || classStatus.includes('98%') || classStatus.includes('已完成')) {
                $.alertMessage(`${className}播放完毕...`);
                clearInterval(timer);
                if (!!$.observer) {  // 防止新的视频已经播放完了，还未来得及赋值observer的问题
                  $.observer.disconnect();  // 停止监听
                }
                resolve();
              }
            }, 200)
            // 根据video是否加载出来判断加速时机
            let nowTime = Date.now();
            let videoTimer = setInterval(() => {
              let video = document.querySelector('video');
              if (video) {
                setTimeout(() => {  // 防止视频刚加载出来，就加速，出现无法获取到元素地bug
                  $.ykt_speed();
                  $.claim();
                  $.observePause();
                  clearInterval(videoTimer);
                }, 2000)
              } else if (!video && Date.now() - nowTime > 20000) {  // 如果20s内仍未加载出video
                localStorage.setItem('n_type', true);
                location.reload();
              }
            }, 5000)
          }, 2000)
        } else if (classType.includes('zuoye')) {
          $.alertMessage(`进入：${className}，目前没有自动作答功能，敬请期待...`);
          setTimeout(() => {
            resolve();
          }, 2000)
        } else if (classType.includes('kaoshi')) {
          $.alertMessage(`进入：${className}，目前没有自动考试功能，敬请期待...`);
          setTimeout(() => {
            resolve();
          }, 2000)
        } else if (classType.includes('ketang')) {
          $.alertMessage(`进入：${className}，目前没有课堂作答功能，敬请期待...`);
          setTimeout(() => {
            resolve();
          }, 2000)
        } else {
          $.alertMessage(`您已经看过${className}...`);
          setTimeout(() => {
            resolve();
          }, 2000)
        }
      }, 2000);
    })
    $.alertMessage(`第${classCount}集播放完了...`);
    classCount++;
    nextCount(classCount);
  }
  main();
};

// 油猴执行文件
(function () {
  'use strict';
  // 防止在 iframe 内重复执行（Firefox 专用）
  if (window.top !== window.self) return;

  const listenDom = setInterval(() => {
    if (document.body) {
      addUserOperate();
      if (location.host.includes('examination.xuetangx.com')) {
        $.panel.querySelector('#n_button').innerText = '考试中~';
        xuetang_exam();
        clearInterval(listenDom);
        return;
      }
      if (localStorage.getItem('n_type') === 'true') {
        $.panel.querySelector('#n_button').innerText = '刷课中~';
        localStorage.setItem('n_type', false);
        yuketang_pro_lms_new();
      }
      clearInterval(listenDom);
    }
  }, 100)
})();