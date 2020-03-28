const Mirror = require("./mirror");

const Binance = require("./binance");
const src = new Binance({
  key: process.env.SRC_KEY,
  sec: process.env.SRC_SEC
});

// 所有API都存在這裡
const cfg = JSON.parse(process.env.METADATA)
console.log("cfg", cfg)
// const cfg = require("./config.json");

const listWorkers = [];
const users = [];

let srcLastTradeId = 0;

for (let i = 0; i < cfg.workers.length; i++) {
  const workerInfo = cfg.workers[i];
  users.push({ name: workerInfo.name, leverage: workerInfo.leverage });
  listWorkers.push(new Mirror(workerInfo));
}
console.log(users);

const getAllWorkersPosition = async () => {
  const list = [];
  for (let i in listWorkers) {
    list.push(listWorkers[i].binance._getStatus());
  }
  const result = await Promise.all(list);
  users.forEach((e,i) => e.balance = result[i].balance);
  return result.map(e => e.status);
};

const checkAllWorkersInTolerance = async (srcPosition, allWorkersPosition) => {
  const list = [];
  for (let i in listWorkers) {
    list.push(listWorkers[i].isInTolerance(srcPosition, allWorkersPosition[i]));
  }
  const result = await Promise.all(list);
  console.log("getAllWorkersPosition -> result", result);
  return list;
};

const syncAllWorkersToSrc = async (srcPosition, allWorkersInTolerance) => {
  const list = [];
  for (let i in allWorkersInTolerance) {
    if (allWorkersInTolerance[i] === false) {
      await listWorkers[i].mirrorToTarget(srcPosition);
    }
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

const getIncomess = async () => {
  let stamp = Date.now();
  const week = 1000*60*60*24*7
  const fapiPrivate_get_allorders = await src.fapiPrivate_get_income({
    symbol: "BTCUSDT",
    limit: 200
  });
  let sum = 0;
  fapiPrivate_get_allorders.filter(e=>stamp - e.time < week).forEach(element => {
    if (element.asset !== "USDT") return;
    sum += Number(element.income);
    return 
  });
      // console.log("getIncomess -> sum", sum)
      let tradeIncome = ``
      fapiPrivate_get_allorders.filter(element => element.asset === 'USDT' && element.incomeType ==='REALIZED_PNL').slice(-30).forEach(e=>
        tradeIncome += `Time: ${new Date(e.time).toLocaleString()}  Income:${e.income}
`)
      let msg = `Proft in a week : ${sum}
${tradeIncome}`
  // let x = fapiPrivate_get_allorders.reduce((a,b)=> a.)
  return msg;
};

const monitoring = async () => {
  let srcPosition = await src._getStatus();
  if(srcPosition === undefined || srcPosition === null){
    srcPosition = await src._getStatus()
  }
  srcPosition = srcPosition.status
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

  const msg = genStatusResp(allWorkersPosition, srcPosition);
  if (
    srcPosition !== null &&
    allWorkersInTolerance.filter(e => e === false).length === 0
  ) {
    return msg;
  } else {
    return `===SOMETHING WRONG...===
${msg}
===SOMETHING WRONG...===`;
  }
};

module.exports = { monitoring,getIncomess };
