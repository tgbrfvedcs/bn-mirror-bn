const Mirror = require("./mirror");
const Telegram = require("telegraf/telegram");
const bot = new Telegram("1096247066:AAFDfT9KrS7jBdjibleDdZ3CFG5-ThmYR6s");
const devGroup = "-353674398";

const Binance = require("./binance");
const src = new Binance({
  key: "ir2CfEX20kNVJoMq5IAkA70kkUpIfOPE5F5ciHwmoRlPXwKfbCLthWWuFdw06HmP",
  sec: "7HD7ihkPhPGnb16XVt5Lh8jdYfLEo5gZpwD5QQSQfdRBepYi3eqlYX9bY4ZQzErL"
});

// 所有API都存在這裡
const cfg = require("./config.json");

const listWorkers = [];
const users = [];

let srcLastTradeId = 0;

for (let i = 0; i < cfg.workers.length; i++) {
  const workerInfo = cfg.workers[i];
  users.push({ name: workerInfo.name, leverage: workerInfo.leverage });
  listWorkers.push(new Mirror(workerInfo));
}
users.forEach(user => {
  console.log({...user})
});

const getAllWorkersPosition = async () => {
  const list = [];
  for (let i in listWorkers) {
    list.push(listWorkers[i].binance._getStatus());
  }
  const result = await Promise.all(list);
  users.forEach((e, i) => (e.balance = result[i].balance));
  return result.map(e => e.status);
};

const checkAllWorkersInTolerance = async (srcPosition, allWorkersPosition) => {
  const list = [];
  for (let i in listWorkers) {
    list.push(listWorkers[i].isInTolerance(srcPosition, allWorkersPosition[i]));
  }
  const result = await Promise.all(list);
  console.log("checkAllWorkersInTolerance ->", result);
  return list;
};

const syncAllWorkersToSrc = async (srcPosition, allWorkersInTolerance) => {
  const list = [];
  for (let i in allWorkersInTolerance) {
    if (allWorkersInTolerance[i] === false) {
      list.push(listWorkers[i].mirrorToTarget(srcPosition));
    }
    if (!list.length) return;
    const result = await Promise.all(list);
    console.log("syncAllWorkersToSrc -> result", result);
  }
};

const getSrcTrades = async () => {
  const fapiPrivate_get_allorders = await src.fapiPrivate_get_allorders({
    symbol: "BTCUSDT",
    limit: 20
  });
  // console.log("fapiPrivate_get_allorders", fapiPrivate_get_allorders);
  return fapiPrivate_get_allorders;
};

const getIncomess = async () => {
  let stamp = Date.now();
  const week = 1000 * 60 * 60 * 24 * 7;
  const fapiPrivate_get_allorders = await src.fapiPrivate_get_income({
    symbol: "BTCUSDT",
    limit: 200
  });
  let sum = 0;
  fapiPrivate_get_allorders
    .filter(e => stamp - e.time < week)
    .forEach(element => {
      if (element.asset !== "USDT") return;
      sum += Number(element.income);
      return;
    });
  // console.log("getIncomess -> sum", sum)
  let tradeIncome = ``;
  fapiPrivate_get_allorders
    .filter(
      element =>
        element.asset === "USDT" && element.incomeType === "REALIZED_PNL"
    )
    .slice(-10)
    .forEach(
      e =>
        (tradeIncome += `Time: ${new Date(e.time).toLocaleString()}  Income:${
          e.income
        }
  `)
    );
  let msg = `Proft in a week : ${sum}
  ${tradeIncome}`;
  // let x = fapiPrivate_get_allorders.reduce((a,b)=> a.)
  return msg;
};

const genStatusResp = (allWorkersPosition, srcPosition) => {
  // console.log("genStatusResp -> listWorkers", listWorkers)
  let msg = `Head position: ${srcPosition}
  --------------------------------------------
  `;
  for (let i in listWorkers) {
    msg =
      msg +
      `Name: ${users[i].name},  Balance: ${users[i].balance}
Leverage: ${users[i].leverage},  Position: ${allWorkersPosition[i]}
`;
  }
  return msg;
};
const monitoring = async () => {
  let srcPosition = await src._getStatus();
  if (srcPosition === undefined || srcPosition === null) {
    srcPosition = await src._getStatus();
  }
  srcPosition = srcPosition.status;
  console.log("srcPosition", srcPosition);
  // 2. Get ends status(Promise.all)
  let allWorkersPosition = await getAllWorkersPosition();
  // 3. Check if ends in src's tolarance (side & percent)

  let allWorkersInTolerance = [];
  if (srcPosition !== null) {
    allWorkersInTolerance = await checkAllWorkersInTolerance(
      srcPosition,
      allWorkersPosition
    );
  }

  let msg = genStatusResp(allWorkersPosition, srcPosition);
  if (
    srcPosition !== null &&
    allWorkersInTolerance.filter(e => e === false).length === 0
  ) {
  } else {
    msg = `===SOMETHING WRONG...===
  ${msg}
  ===SOMETHING WRONG...===`;
  }
  bot.sendMessage(devGroup, msg);
};

async function checker() {
  try {
    let srcTrades = await getSrcTrades();
    if (srcTrades[srcTrades.length - 1].orderId !== srcLastTradeId) {
      console.log(new Date().toLocaleString())
      // 1. Get src status
      let srcPosition = await src._getStatus();
      srcPosition = srcPosition.status;
      console.log("srcPosition", srcPosition);

      let p2 = getTime();
      // 2. Get ends status(Promise.all)
      let allWorkersPosition = await getAllWorkersPosition();
      console.log("getAllWorkersPosition", getTimeDIff(p2));

      let p3 = getTime();

      // 3. Check if ends in src's tolarance (side & percent)
      let allWorkersInTolerance = await checkAllWorkersInTolerance(
        srcPosition,
        allWorkersPosition
      );

      let p3f = getTime();
      //    -false--> All ends sync to src status
      let syncWorkersToSrc = await syncAllWorkersToSrc(
        srcPosition,
        allWorkersInTolerance
      );
      console.log("syncAllWorkersToSrc(p3f)", getTimeDIff(p3f));

      srcLastTradeId = srcTrades.pop().orderId;
      monitoring();
    }
  } catch (error) {
    console.log(error);
  }
  // const checker = async srcLastTradeId => {
}
const getTime = () => {
  return Date.now();
};
const getTimeDIff = t => {
  return Date.now() - t;
};
(async () => {
  try {
    console.log(new Date().toLocaleString())
    let p1 = getTime();
    // 1. Get src status
    let srcPosition = await src._getStatus();
    srcPosition = srcPosition.status;
    console.log("srcPosition", srcPosition);

    // let getIncomesds = await getIncomess();
    let p2 = getTime();
    // 2. Get ends status(Promise.all)
    let allWorkersPosition = await getAllWorkersPosition();

    console.log("getAllWorkersPosition", getTimeDIff(p2));

    let p3 = getTime();
    // 3. Check if ends in src's tolarance (side & percent)
    let allWorkersInTolerance = await checkAllWorkersInTolerance(
      srcPosition,
      allWorkersPosition
    );

    let p3f = getTime();
    //    -false--> All ends sync to src status
    let syncWorkersToSrc = await syncAllWorkersToSrc(
      srcPosition,
      allWorkersInTolerance
    );

    console.log("syncAllWorkersToSrc(p3f)", getTimeDIff(p3f));

    let p4 = getTime();
    // 4. Get src trades from src allorders
    let srcTrades = await getSrcTrades();

    let p5 = getTime();
    // 5. Save last trades id in memory.
    srcLastTradeId = srcTrades.pop().orderId;

    // 6. Loop check if src has new order(last trade isn't the saved one)
    //    -true--> do step 1, 2(Promise.all), 3.false
    setInterval(checker, 6000);
    // debugger;
  } catch (error) {
    console.log(error);
  }
})();

// todo: 替換BitMEXClient成Binance，並使用binance._getStatus來取得當前配置
// 再來是透過下面API拿交易資料，加上mongodb來配置當前狀況
// fapiPrivate_get_allorders({ symbol: "BTCUSDT",limit :20 })

// client.addStream('', 'wallet', function(data, symbol, tableName) {
//   for (let worker of Object.keys(listWorkers)) {
//     listWorkers[worker].setWalletAmount(data[0].amount);
//   }
// });

// client.addStream('XBTUSD', 'position', function(data, symbol, tableName) {
//   for (let worker of Object.keys(listWorkers)) {
//     const { homeNotional, currentQty } = data[0];
//     listWorkers[worker].syncPositionandCheckUpdate(homeNotional, currentQty);
//   }
// });
