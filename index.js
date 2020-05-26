const Mirror = require("./mirror");
const Telegram = require("telegraf/telegram");
const bot = new Telegram("1096247066:AAFDfT9KrS7jBdjibleDdZ3CFG5-ThmYR6s");
const devGroup = "-353674398";
const winston = require('winston');

const Binance = require("./binance");
const src = new Binance({
  key: "ir2CfEX20kNVJoMq5IAkA70kkUpIfOPE5F5ciHwmoRlPXwKfbCLthWWuFdw06HmP",
  sec: "7HD7ihkPhPGnb16XVt5Lh8jdYfLEo5gZpwD5QQSQfdRBepYi3eqlYX9bY4ZQzErL"
});


const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});



// 所有API都存在這裡
const cfg = require("./config.json");

const listWorkers = [];
const users = [];

let srcLastTradeId = 0;
let getSrcTradesCount = 20;
let lastMinuteCheck = Date.now();

for (let i = 0; i < cfg.workers.length; i++) {
  const workerInfo = cfg.workers[i];
  users.push({ name: workerInfo.name, leverage: workerInfo.leverage, initialFund: workerInfo.initialFund });
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
  users.forEach((e,i) =>{
    e.balance = result[i].balance;
    e.unRealizedProfit = result[i].unRealizedProfit;
    if(!e.initialFund) return
    
    let is_healthy = checkBalanceHealth(e);
    if(!is_healthy){
      listWorkers[i].binance._offset()
      warnUnhealthy(Object.assign({}, e));
      removeUserAndWorkerByName(e.name);
    }
    return
  });
  return result.map(e => e.status);
};

const warnUnhealthy = (user) => {
  let msg = `移除" ${user.name}"  餘額: ${user.balance},  訊息: 餘額過低`
  bot.sendMessage(devGroup, msg);
}

const removeUserAndWorkerByName = (name) => {
  const userIndex = users.findIndex((user) => user.name === name);
  listWorkers.splice(userIndex, 1);
  users.splice(userIndex, 1);
}

const checkBalanceHealth = (user) => {
  const {balance, unRealizedProfit, initialFund} = user;
  const health_rate = 0.73;

  const health_line = health_rate * initialFund;
  const current_health = balance + unRealizedProfit;
  return current_health > health_line;
}

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
  }
    if (!list.length) return;
    const result = await Promise.all(list);
    // console.log("syncAllWorkersToSrc -> result", result);
  
};

const getSrcTrades = async () => {
  const fapiPrivate_get_allorders = await src.fapiPrivate_get_allorders({
    symbol: "BTCUSDT",
    limit: getSrcTradesCount
  });
  // console.log(Date.now());
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

const roundToTwo = (num) => {
  return +(Math.round(num + "e+3")  + "e-3");
}

const genStatusResp = (allWorkersPosition, { status, unRealizedProfit }) => {
  let srcPosition = status;
  // console.log("genStatusResp -> listWorkers", listWorkers)
  let msg = `Head position: ${roundToTwo(srcPosition)}
--------------------------------------------
`;
  for (let i in listWorkers) {
    msg =
      msg +
      `Name: ${users[i].name},  
Balance: ${roundToTwo(users[i].balance)},
unRealizedProfit: ${roundToTwo(users[i].unRealizedProfit)},
Leverage: ${users[i].leverage},  Position: ${roundToTwo(allWorkersPosition[i])}

`;
  }
  return msg;
};
const monitoring = async () => {
  let srcPosition = await src._getStatus();
  if (srcPosition === undefined || srcPosition === null) {
    srcPosition = await src._getStatus();
  }
  // srcPosition = srcPosition.status;
  console.log("srcPosition", srcPosition);
  // 2. Get ends status(Promise.all)
  let allWorkersPosition = await getAllWorkersPosition();
  // 3. Check if ends in src's tolarance (side & percent)

  let allWorkersInTolerance = [];
  if (srcPosition && srcPosition.status) {
    allWorkersInTolerance = await checkAllWorkersInTolerance(
      srcPosition.status,
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

const runCheckProcesses = async () => {
  console.log(new Date().toLocaleString());
  console.log(Date.now());
  // 1. Get src status
  let srcPosition = await src._getStatus();
  srcPosition = srcPosition.status;
  console.log("srcPosition", srcPosition);

  let p2 = getTime();
  // 2. Get ends status(Promise.all)
  let allWorkersPosition = await getAllWorkersPosition();
  console.log("getAllWorkersPosition", getTimeDIff(p2));

  // 3. Check if ends in src's tolerance (side & percent)
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
  return allWorkersInTolerance;
};

const minuteCheck = () => {
  const interval = 1 * 1000 * 30;
  const now = Date.now();
  if(now - lastMinuteCheck > interval){
    lastMinuteCheck = now;
    return true;
  }
  return false;
}

async function checker() {
  try {
    let srcTrades = await getSrcTrades();
    let lastIndex = srcTrades.findIndex((e) => e.orderId === srcLastTradeId);
    if (lastIndex !== getSrcTradesCount - 1) {
      logger.info(`${Date.now()}, ${new Date().toLocaleString()}`);
      logger.info(`fapiPrivate_get_allorders`,srcTrades);
      if (srcTrades[lastIndex + 1].status !== "FILLED") return;
      await runCheckProcesses();
      srcLastTradeId = srcTrades[lastIndex + 1].orderId;
      monitoring();
    }else if(minuteCheck()){
      let tolerance = await runCheckProcesses();
      if(tolerance.includes(false)){
        logger.info(`${Date.now()}, ${new Date().toLocaleString()}`);
        logger.info(`fapiPrivate_get_allorders`,srcTrades);
        monitoring();
      }
    }
  } catch (error) {
    console.log(error);
  }
}

const getTime = () => {
  return Date.now();
};
const getTimeDIff = t => {
  return Date.now() - t;
};

const initLastTrade = async() =>{
    // 4. Get src trades from src allorders
    let srcTrades = await getSrcTrades();
    logger.info(`initLastTrade ${Date.now()}, ${new Date().toLocaleString()}`);
    logger.info(`fapiPrivate_get_allorders`,srcTrades);
    // 5. Save last trades id in memory.
    let lastStatus = null;
    let lastTrade = null;
    while(lastStatus !== 'FILLED'){
      lastTrade = srcTrades.pop();
      lastStatus = lastTrade.status;
    }
    return lastTrade.orderId;
}

(async () => {
  try {
    await runCheckProcesses();
    // 4. Get src trades from src allorders
    // 5. Save last trades id in memory.
    srcLastTradeId = await initLastTrade();
    // monitoring();
    // 6. Loop check if src has new order(last trade isn't the saved one)
    //    -true--> do step 1, 2(Promise.all), 3.false
    setInterval(checker, 6000);
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
