#!/usr/bin/env node
import * as express from "express";
import * as puppeteer from "puppeteer";
import * as uuid from "uuid";
import * as path from "path";
import * as minimist from "minimist";

interface SsrizeOptions {
  port: string;
}

const defaultOptions = {
  port: 3000
};

class Server {
  private app: express.Application;
  private readonly ssrUserAgent: string;
  private options: SsrizeOptions;

  constructor(options: any) {
    this.options = {
      ...defaultOptions,
      ...options
    };
    this.app = express();
    this.config();
    this.ssrUserAgent = `SSRIZE_${uuid.v4()}`;
  }

  config() {
    const handler = async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (req.headers["user-agent"] === this.ssrUserAgent) {
        res.sendFile(path.join(process.cwd(), "build", "index.html"));
        return;
      }

      try {
        const browser = await puppeteer.launch({
          headless: true,
          args: ["--no-sandbox"]
        });
        const page = await browser.newPage();

        await page.setRequestInterception(true);

        page.on("request", (puppeteerReq: puppeteer.Request) => {
          const blacklist = [
            "www.google-analytics.com",
            "/gtag/js",
            "ga.js",
            "analytics.js"
          ];
          const whitelist = ["document", "script", "xhr", "fetch"];
          if (!whitelist.includes(puppeteerReq.resourceType())) {
            return puppeteerReq.abort();
          } else if (
            blacklist.find(regex => puppeteerReq.url().match(regex) !== null) // TODO check regex matching
          ) {
            return puppeteerReq.abort();
          }
          return puppeteerReq.continue();
        });

        await page.setUserAgent(this.ssrUserAgent);

        const local_url =
          `http://127.0.0.1:${this.options.port}` + req.originalUrl;
        await page.goto(local_url, {
          waitUntil: "networkidle0"
        });

        const html = await page.content();

        res.send(html);
      } catch (e) {
        console.log(e);
        next("unable to serve request");
      }
    };

    this.app.get("/", handler);
    this.app.use(express.static("build")); // get from parameter
    this.app.get("*", handler);
  }

  start() {
    this.app.listen(this.options.port, () => {
      console.log("SSRize server listening on port " + this.options.port);
    });
  }
}

const [, , ...args] = process.argv;
const ssrizeArgs = minimist(args);

if (args.length > 0) {
  console.log(ssrizeArgs);
  const server = new Server(ssrizeArgs);
  server.start();
}