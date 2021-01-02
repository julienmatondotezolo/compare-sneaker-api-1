//===================================================================================================================================================================================================================================================================================================================
//
//    ###    ##     ##  ####    #####    #####   ####
//   ## ##   ####   ##  ##  ##  ##  ##   ##     ##
//  ##   ##  ##  ## ##  ##  ##  #####    #####   ###
//  #######  ##    ###  ##  ##  ##  ##   ##        ##
//  ##   ##  ##     ##  ####    ##   ##  #####  ####
//
//===================================================================================================================================================================================================================================================================================================================
/*--------- Variables --------*/
const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const Helpers = require("./utils/helpers.js");
const { log } = require("console");
var path = require("path");
const port = 3000;
const uuid = Helpers.generateUUID();
const htmlFile = path.join(__dirname + "/components/index.html");
const database = require("./utils/database.js");
const app = express();
const puppeteer = require("puppeteer");
const $ = require("cheerio");
const CronJob = require("cron").CronJob;
const request = require("request");
const pg = require("knex")({
  client: "pg",
  version: "9.6",
  searchPath: ["knex", "public"],
  connection: process.env.PG_CONNECTION_STRING
    ? process.env.PG_CONNECTION_STRING
    : "postgres://example:example@localhost:5432/sneakerdb",
});
let productArray = [];
let browser;
http.Server(app);
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
const hosturl = "http://localhost:3001";
/*--------- SHOW ALL RECORDS --------*/
app.get("/", (req, res) => {
  res.status(200).sendFile(htmlFile);
});

/*--------- Arrays and objects --------*/
let shops = [
  "Snipes",
  "Adidas",
  "Zalando",
  "Nike",
  "Sneakerdistrict ",
  "Torfs",
  "SneakerBaron",
  "Asos",
  "Ultimate Sneakerstore",
];


//TODO TORFS
/*======= Torfs function =======*/
async function torfs(url, res, amountOfProducts) {
  productArray = [];
  const base_url = "https://www.torfs.be";
  let countProductNotFound = 0;
  let brand_uuid;
  try {
    const sneakers = await pg
    .select(['uuid'])
    .from("brands")
    .where({ brand_name: 'torfs' })
    .then(async function (data) {
      console.log("✅", `Brand uuid is ${data[0].uuid}`);
      brand_uuid = data[0].uuid;
    })
    .catch((e) => {
      console.log("💩", e);
    });
  } catch (error) {
    console.log("💩", err);
    res.status(404);
  }
  try {
    page = await configureBrowser(url);
    let html = await page.evaluate(() => document.body.innerHTML);
    console.log("Start scraping");
    let waitForProducts = new Promise((resolve, reject) => {
      $(".product-tile", html).each(async function (counter, value) {
        let product_url = $(this).find(".js-product-tile-link").attr("href");
        if (product_url == undefined) {
          countProductNotFound = countProductNotFound + 1;
        } else {
          // GO TO DETAIL
          detailpage = await openPage(base_url + product_url);
          const detail = await detailpage.evaluate(
            () => document.body.innerHTML
          );
          const content = $(".product-detail", detail);
          let product_brand = content
            .find(".js-productAttributes .brand-name")
            .text();
          let product_name = content
            .find(".js-productAttributes .product-name")
            .text();


          let product_price =   content.find(".price span.value").first().text() !== "" ?  content.find(".price span.value").first().text() : content.find(".product-variants .price__list .value").text() ;
          product_price = product_price.replace(/(\r\n|\n|\r)/gm, "").trim();



          let product_sale_price = content
            .find(".product-variants .discounted .value")
            .text()
            .replace(/(\r\n|\n|\r)/gm, "")
            .trim();
          let product_sale = product_sale_price ? true : false;
          let product_description = content
            .find(".attribute-siteDescription")
            .text()
            .trim();
          let product_available = [];
          let product_colors = [];
          let product_shipping_info =
            "Voor 22u besteld, volgende werkdag geleverd.";
          content
            .find(".size-blocks .size-block")
            .each(async function (index, value) {
              product_available.push(
                $(this)
                  .find("a")
                  .text()
                  .replace(/(\r\n|\n|\r)/gm, "")
                  .trim()
              );
            });
          let imageElem = content.find("img.carousel-image.img-fluid.w-100");
          let product_image = imageElem.prop("data-src")
            ? imageElem.prop("data-src")
            : imageElem.prop("src");
          product_available = [...new Set(product_available)];

          // Waitforobject
          let waitForObject = new Promise((resolve, reject) => {
            const sneakerObj = {
              uuid: Helpers.generateUUID(),
              product_brand: product_brand,
              product_name: product_name,
              product_price: product_price,
              product_sale_price: product_sale_price,
              product_sale: product_sale,
              product_description: product_description,
              product_image: product_image,
              product_available: JSON.stringify(product_available),
              product_colors: JSON.stringify(product_colors),
              product_url: base_url + product_url,
              product_shipping_info: product_shipping_info,
              brand_uuid: brand_uuid,
            };
            database.addSneakers(sneakerObj).then(() => {
              // return sneakerObj;
              resolve(sneakerObj);
            });
          });
          // Completed object
          waitForObject
            .then((value) => {
              productArray.push(value);
              if (($(".product-tile", html).length - countProductNotFound) === productArray.length)
                resolve();
            })
            .catch((error) => {
              console.log("💩", error.message);
            });
        }
      });
    });

    waitForProducts
      .then(async () => {
        let endpage;
        let currentpage;
        $(".bs-link", html).each(async function (counter, value) {
          endpage = $(this).prop("data-page");
        });
        currentpage = $(".bs-current", html).prop("data-page");
        if (currentpage !== endpage) {
          let nextpage = await $(".bs-current", html).next().prop("data-page");
          page
            .close()
            .then(() => {
              console.log("closed page");
              browser.close().then(() => {
                console.log("gotonextpage");
                request.post(`${hosturl}/torfs`, {
                  form: { counter: nextpage, amount: amountOfProducts },
                });
                res.json(productArray);
              });
            })
            .catch((error) => {
              console.log("💩", error.message);
            });
        } else {
          page.close();
          browser.close().then(() => {
            console.log("closed browser");
            res.json(productArray);
          });
         
        }
      })
      .catch((error) => {
        console.log("💩", error.message);
      });
  } catch (error) {
    console.log("💩", error);
  }
}
/*======= Torfs start scraping =======*/
app.get("/torfs", async (req, res) => {
  try {
    console.log("Torfs");
    await database.deleteSneakers();
    let amountOfProducts = 15;
    let url = `https://www.torfs.be/nl/zoekresultaten?q=sneakers&start=0&sz=${amountOfProducts}`;
    await torfs(url, res, amountOfProducts);
  } catch (err) {
    console.log("💩", err);
    res.status(404);
  }
});
/*======= Torfs start scraping second pages =======*/
app.post("/torfs", async (req, res) => {
  try {
    console.log(`Torfs page ${req.body.counter}`);
    let amountOfProducts = req.body.amount;
    let total = amountOfProducts * req.body.counter;
    let url = `https://www.torfs.be/nl/zoekresultaten?q=sneakers&start=${total}&sz=${amountOfProducts}`;
    console.log(url);
    await torfs(url, res, amountOfProducts);
  } catch (err) {
    console.log("💩", err);
    res.status(404);
  }
});



//TODO SNIPES
app.get("/snipes", (req, res) => {
  res.send("snipes");
});
app.get("/adidas", (req, res) => {
  res.send("adidas");
});
app.get("/shops/", async (req, res) => {
  try {
    const sneakers = await pg
    .select()
    .from("sneakers")
    .then(async function (data) {
      console.log("✅", "Show sneakers");
      res.json(data);
    })
    .catch((e) => {
      console.log("💩", e);
    });

  } catch (error) {
    console.log("💩", err);
    res.status(404);
  }
});
app.get("/seeds", async (req, res) => {
  try {
    let sneaker = await database.sneakerSeeders();
    let brand = await database.brandSeeders();
    res.json(sneaker);
    res.json(brand);
  } catch (error) {
    console.log("💩", error);
  }
});
app.get("/show", async (req, res) => {
  try {
    const result = await pg.select("*").from("sneakers");
    res.json({
      res: result,
    });
  } catch (error) {
    console.log("💩", error);
  }
});
app.get("/sneakers/:brand", async (req, res) => {
  try {
    const sneakers = await pg
    .select([
      'brands.brand_name',
      'brands.brand_logo',
      'brands.brand_url',
      'brands.brand_reviews',
      'sneakers.product_brand',
      'product_name',
      'product_price',
      'product_sale_price',
      'product_sale',
      'product_description',
      'product_image',
      'product_available',
      'product_url',
      'product_shipping_info',
    ])
    .from("brands")
    .rightJoin('sneakers', 'sneakers.brand_uuid', 'brands.uuid')
    .where({ brand_name: req.params.brand.toLowerCase() })
    .then(async function (data) {
      if(data.length == 0){
        console.log(data);
       // No content
       res.status(204).send();
      }else{
        console.log("✅", "Show sneakers");
        for (const sneaker of data) {
          sneaker.brand_name = sneaker.brand_name.toUpperCase();
        }
      
        res.json(data);
      }
    })
    .catch((e) => {
      console.log("💩", e);
    });
  } catch (error) {
    console.log("💩", err);
    res.status(404);
  }
});
async function configureBrowser(url) {
  try {
    browser = await puppeteer.launch({
      // headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    return openPage(url);
  } catch (error) {
    console.log("💩", error);
  }
}
async function openPage(url) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0", timeout: 0 });
  return page;
}
database.initialiseTables();
module.exports = app;



