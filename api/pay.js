import { createHash } from 'crypto';
import request from 'request-promise';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  // 微信支付配置（请稍后替换成你自己的）
  const WX_CONFIG = {
    appid: '你的小程序AppID',
    mch_id: '你的商户号',
    key: '你的商户API密钥',
    notify_url: 'https://lp-blush.vercel.app/api/notify'
  };

  const { total_fee = 1, body = '测试支付', openid } = req.body;

  if (!openid) {
    return res.status(400).json({ error: '缺少 openid' });
  }

  // 统一下单
  const nonce_str = Math.random().toString(36).substr(2, 15);
  const out_trade_no = 'LP' + Date.now();
  const params = {
    appid: WX_CONFIG.appid,
    mch_id: WX_CONFIG.mch_id,
    nonce_str,
    body,
    out_trade_no,
    total_fee,
    spbill_create_ip: '127.0.0.1',
    notify_url: WX_CONFIG.notify_url,
    trade_type: 'JSAPI',
    openid
  };

  // 生成签名
  const signStr = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&') + `&key=${WX_CONFIG.key}`;
  const sign = createHash('md5').update(signStr).digest('hex').toUpperCase();
  params.sign = sign;

  // 转XML
  const xml = Object.entries(params)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join('');
  const xmlData = `<xml>${xml}</xml>`;

  try {
    // 请求微信接口
    const resultXml = await request({
      url: 'https://api.mch.weixin.qq.com/pay/unifiedorder',
      method: 'POST',
      body: xmlData,
      headers: { 'Content-Type': 'application/xml' }
    });

    // 解析XML
    const result = {};
    resultXml.replace(/<(\w+)>([^<]+)<\/\1>/g, (_, k, v) => result[k] = v);

    if (result.return_code !== 'SUCCESS' || result.result_code !== 'SUCCESS') {
      return res.status(500).json({ error: result.return_msg || result.err_code_des });
    }

    // 生成小程序支付参数
    const timeStamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = Math.random().toString(36).substr(2, 15);
    const packageStr = `prepay_id=${result.prepay_id}`;
    const paySignParams = {
      appId: WX_CONFIG.appid,
      timeStamp,
      nonceStr,
      package: packageStr,
      signType: 'MD5'
    };

    const paySignStr = Object.keys(paySignParams)
      .sort()
      .map(k => `${k}=${paySignParams[k]}`)
      .join('&') + `&key=${WX_CONFIG.key}`;
    const paySign = createHash('md5').update(paySignStr).digest('hex').toUpperCase();

    // 返回给前端
    res.json({
      timeStamp,
      nonceStr,
      package: packageStr,
      signType: 'MD5',
      paySign
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
