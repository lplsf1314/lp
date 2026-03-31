import { createHash } from 'crypto';
import request from 'request-promise';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method Not Allowed');
  }

  const WX_CONFIG = {
    appid: process.env.WX_APPID,
    mch_id: process.env.WX_MCH_ID,
    key: process.env.WX_KEY,
    notify_url: 'https://lp-blush.vercel.app/api/notify'
  };

  const { total_fee = 1, body = '测试商品', openid } = req.body;

  if (!openid) {
    return res.status(400).json({ error: '缺少 openid' });
  }

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

  const signStr = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&') + `&key=${WX_CONFIG.key}`;
  const sign = createHash('md5').update(signStr).digest('hex').toUpperCase();
  params.sign = sign;

  const xml = Object.entries(params)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join('');
  const xmlData = `<xml>${xml}</xml>`;

  try {
    const resultXml = await request({
      url: 'https://api.mch.weixin.qq.com/pay/unifiedorder',
      method: 'POST',
      body: xmlData,
      headers: { 'Content-Type': 'application/xml' }
    });

    const result = {};
    resultXml.replace(/<(\w+)>([^<]+)<\/\1>/g, (_, k, v) => result[k] = v);

    if (result.return_code !== 'SUCCESS' || result.result_code !== 'SUCCESS') {
      return res.status(500).json({ error: result.return_msg || result.err_code_des });
    }

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
