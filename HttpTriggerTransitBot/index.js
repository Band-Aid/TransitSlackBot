require('dotenv').config();
module.exports = async function (context, req) {
    const qs = require('querystring');
    const fs = require('fs');
    const Slack = require('./SlackRequest')
    const body = qs.parse(req.body);
    const text = body.text;
    const response_url = body.response_url
    const fromS_toS = text.split("から")
    const puppeteer = require('puppeteer');
    const BoxSDK = require('box-node-sdk')
    const JWT = JSON.parse(process.env['JWT'])
    const SDK = BoxSDK.getPreconfiguredInstance(JWT)
    const SLACKTOKENOLD = process.env['SLACKTOKEN']
    const path = require("path");
    function getFormattedTime() {
        var today = new Date();
        var y = today.getFullYear();
        var m = today.getMonth() + 1;
        var d = today.getDate();
        var h = today.getHours();
        var mi = today.getMinutes();
        var s = today.getSeconds();
        return y + "-" + m + "-" + d + "-" + h + "-" + mi + "-" + s;
    }

    function PostSlack(transit_url, res_url,link) {
        
                let headers = {
                    'Content-Type': 'application/json'
                }
                let payload = {
                    "response_type": "in_channel",
                    "text": "乗り換え結果",
                    "attachments": [
                        {
                            "title": "乗り換え案内の結果",
                            "title_link": transit_url,
                            "text": "結果はこちら",
                            "image_url": link
                        }
                    ]
                }
                context.log(payload)
                Slack.post(res_url, headers,payload).catch(error => context.log(error))
    }

    async function getYahooTransit(text,response_url) {


        if (text.includes("から")) {
            context.log("logging")
            const browser = await puppeteer.launch({args: ['--no-sandbox', '--disable-setuid-sandbox']});
            const targetElementSelector = '#main'
            const page = await browser.newPage();
            page.setViewport({ width: 1000, height: 600, deviceScaleFactor: 1 });
            await page.goto('https://transit.yahoo.co.jp/', { waitUntil: 'networkidle2' });
            await page.type('#sfrom', fromS_toS[0])
            await page.type('#sto', fromS_toS[1])
            let loadPromise = page.waitForNavigation({ waitUntil: "domcontentloaded" });
            await page.click('input[id="searchModuleSubmit"');
            await loadPromise;
            await page.waitFor(targetElementSelector)
            const clip = await page.evaluate(s => {
                const el = document.querySelector(s)
                // エレメントの高さと位置を取得
                const { width, height, top: y, left: x } = el.getBoundingClientRect()
                return { width, height, x, y }
            }, targetElementSelector)

            // スクリーンショットに位置と大きさを指定してclipする
            const SCPATH = './Screenshot/' + getFormattedTime() + '.png'
            const screenshot = await page.screenshot({clip,
                omitBackground: true,
                encoding: 'binary'
              });
           // #test await page.screenshot({ clip, path: SCPATH })
            context.log("postslack")
            let currentURL = page.url()
            const serviceAccountClient = SDK.getAppAuthClient('enterprise');
            context.log(SCPATH)
            let filename = path.basename(SCPATH)
            context.log(filename)
            
            serviceAccountClient.files.uploadFile('62866090278', filename, screenshot).then(file => {

            serviceAccountClient.files.update(file.entries[0].id,{shared_link: serviceAccountClient.accessLevels.DEFAULT})
            .then(file => {
                let sharedLinkURL = file.shared_link.url;
                context.log(sharedLinkURL)
		        let slug = sharedLinkURL.split('s/').pop()
		        let link = "https://dbox.box.com/shared/static/" + slug + ".png"
                PostSlack(currentURL, response_url,link)
                })
            })
            
           
            //page.close()
            browser.close()
        }
        else {
            let headers = {
                'Content-Type': 'application/json'
            }
            let payload = {
                "text": "失敗",
                "attachments": [
                    {
                        "title": "乗り換え案内の結果",
                        "text": "失敗です"
                    }
                ]
            }
            Slack.post(response_url,headers,payload)
        }
    }


    context.log('JavaScript HTTP trigger function processed a request.');

    if (body.token === SLACKTOKENOLD) {
        context.res = {
            status: 200,
            body: "ちょっとまっててね"
        }
    getYahooTransit(text,response_url)
    }
    else{
        context.res = {
            status: 403,
            body: "あくきん"
        }
    }

};
