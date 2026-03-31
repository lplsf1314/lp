// api/pay.js
const crypto = require('crypto');
const fetch = require('node-fetch');

// 微信支付配置（从Vercel环境变量读取，安全不泄露）
const WX_CONFIG = {
  appid: process.env.WX_APPID,
  mch_id: process.env.WX_MCH_ID,
  key: process.env.WX_KEY,
  notify_url: 'https://lp-blush.vercel.app/api/notify'
};

// 主函数
export default async function handler(req, res) {
  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  try {
    // 解析请求数据
    const { openid, total_fee = 1, body = '测试商品' } = req.body;

    // 校验openid
    if (!openid) {
      return res.status(400).json({ error: '缺少 openid' });
    }

    // 1. 生成随机字符串
    const nonce_str = Math.random().toString(36).substr(2, 15);

    // 2. 统一下单参数
    const out_trade_no = 'LP' + Date.now();
    const params = {
      appid: WX_CONFIG.appid,
      mch_id: WX_CONFIG.mch_id,
      nonce_str: nonce_str,
      body: body,
      out_trade_no: out_trade_no,
      total_fee: total_fee,
      spbill_create_ip: '127.0.0.1',
      notify_url: WX_CONFIG.notify_url,
      trade_type: 'JSAPI',
      openid: openid
    };

    // 3. 生成签名
    const signStr = Object.keys(params)
      .sort()
      .filter(k => params[k] && k !== 'sign')
      .map(k => `${k}=${params[k]}`)
      .join('&') + `&key=${WX_CONFIG.key}`;
    const sign = crypto.createHash('md5').update(signStr, 'utf8').digest('hex').toUpperCase();
    params.sign = sign;

    // 4. 对象转XML
    const xml = `<xml>${Object.keys(params).map(k => `<${k}>${params[k]}</${k}>`).join('')}</xml>`;

    // 5. 请求微信统一下单接口
    const orderRes = await fetch('https://api.mch.weixin.qq.com/pay/unifiedorder', {
      method: 'POST',
      body: xml,
      headers: { 'Content-Type': 'text/xml' }
    });
    const orderData = await orderRes.text();

    // 6. XML转对象
    const orderResult = {};
    const reg = /<([^>]+)>([^<]+)<\/\1>/g;
    let match;
    while ((match = reg.exec(orderData))) {
      orderResult[match[1]] = match[2];
    }

    // 7. 校验下单结果
    if (orderResult.return_code !== 'SUCCESS' || orderResult.result_code !== 'SUCCESS') {
      return res.status(400).json({ error: orderResult.err_code_des || '下单失败' });
    }

    // 8. 生成支付参数
    const payData = {
      timeStamp: Math.floor(Date.now() / 1000).toString(),
      nonceStr: nonce_str,
      package: `prepay_id=${orderResult.prepay_id}`,
      signType: 'MD5'
    };

    // 9. 生成支付签名
    const paySignStr = Object.keys(payData)
      .sort()
      .filter(k => payData[k] && k !== 'sign')
      .map(k => `${k}=${payData[k]}`)
      .join('&') + `&key=${WX_CONFIG.key}`;
    const paySign = crypto.createHash('md5').update(paySignStr, 'utf8').digest('hex').toUpperCase();
    payData.paySign = paySign;

    // 10. 返回支付参数给小程序
    return res.status(200).json(payData);
  } catch (err) {
    console.error('支付接口错误：', err);
    return res.status(500).json({ error: '服务器错误' });
  }
}
✅ 操作步骤（绝对零出错）
