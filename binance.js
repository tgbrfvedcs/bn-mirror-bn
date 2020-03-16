const ccxt = require('ccxt').binance;
// const cfg = require('./config');
// class Mirror extends ccxt {
module.exports = class Mirror extends ccxt {
  constructor(workerInfo) {
    super({
      apiKey: workerInfo.key,
      secret: workerInfo.sec
    });
    // 1 = long
    // 0 = offset
    this._defUSDTAmount = 50;
  }

  async getSrcStatus() {
    let balanceList = await this.fetchBalance();
    let USDTbalance = balanceList.USDT.total;
    console.log(USDTbalance);
    if (USDTbalance > this._defUSDTAmount) {
      return 0;
    } else {
      return 1;
    }
  }
  async _getAccount() {
    return await this.fapiPrivate_get_account();
  }
  async _placeOrder(side, quantity) {
    if (!side || !quantity) return;
    const option = {
      symbol: 'BTCUSDT',
      side,
      type: 'MARKET',
      quantity,
      timestamp: Date.now()
    };
    // debugger;
    return await this.fapiPrivate_post_order(option);
  }
  async _postOrder(position, type) {
    if (position === 0 || !position) return;
    const offset = type === 'offset';
    let side = '';
    switch (Math.sign(position)) {
      case 0:
        return false;
      case 1:
        side = offset ? 'SELL' : 'BUY';
        break;
      case -1:
        side = offset ? 'BUY' : 'SELL';
        break;
    }
    debugger;
    // console.log("TCL: Mirror -> _postOrder -> position", position);
    return await this._placeOrder(side, Math.abs(position));
  }
  async _getStatus() {
    try {
      const balance = await this._get_USDT_balance();
      // const tempPostition = await this.fapiPrivateGetPositionRisk()
      const { positionAmt, entryPrice } = (
        await this.fapiPrivateGetPositionRisk()
      ).find(e => e.symbol === 'BTCUSDT');
      // debugger;
      return positionAmt / (balance / entryPrice);
    } catch (e) {
      // await getAccountDraft();
      console.log(e);
      return;
    }
  }
  async _get_USDT_balance() {
    const fapiPrivate_get_balance = await this.fapiPrivate_get_balance();
    return fapiPrivate_get_balance.find(e => e.asset === 'USDT').balance;
  }
  async _postMirroOrder(srcPositionPercent) {
    try {
      const balance = await this._get_USDT_balance();
      // const futureState = await ftx.requestDraft(await listFutures());
      const ask = (await this.fapiPublic_get_premiumindex()).find(
        e => e.symbol === 'BTCUSDT'
      ).markPrice;
      const sizeIncrement = 0.001;
      // const { ask, bid, sizeIncrement } = futureState.result;
      // buy: total * percent / pr.ask
      // sell: total * percent / pr.bid
      const totalAccountValueBTC = balance / ask;
      console.log('ask: ', ask);
      const currentPosition = (await this.fapiPrivateGetPositionRisk()).find(
        e => e.symbol === 'BTCUSDT'
      ).positionAmt;

      const targetAmount = srcPositionPercent * totalAccountValueBTC;
      const targetGapFTXpostMirroOrder =
        ((targetAmount - currentPosition) / sizeIncrement) * sizeIncrement;

      // const postDraft = await postOrder(targetGapFTXpostMirroOrder);
      debugger;
      const data = await this._postOrder(targetGapFTXpostMirroOrder.toFixed(3));
      console.log(`${data.side ? 'Success!' : 'Failed'}
  Side: ${data.side}
  Size: ${data.origQty}
  Price: ${ask}`);

      // return data[0].price * data[0].size;
      return data;
      // cost
      //     // netSize
      //     // balance.result.positions.find(r => r.future === 'BTC-PERP');
    } catch (e) {
      console.log(e);
      return false;
    }
  }
  async _offset() {
    try {
      // const balance = this.fapiPrivate_get_account();
      const postitionRiskrsponse = await this.fapiPrivateGetPositionRisk();
      const currentPosition = postitionRiskrsponse.find(
        e => e.symbol === 'BTCUSDT'
      ).positionAmt;
      // debugger;
      const offset = await this._postOrder(currentPosition, 'offset');
      if (!offset) {
        return console.log('No need to offset');
      }
      // console.log("TCL: Mirror -> _offset -> offset", offset);
      // const data = await ftx.requestDraft(postDraft);
      const ask = (await this.fapiPublic_get_premiumindex()).find(
        e => e.symbol === 'BTCUSDT'
      ).markPrice;
      console.log(`${offset.side ? 'Success!' : 'Failed'}
      Side: ${offset.side}
      Size: ${offset.origQty}
      Price: ${ask}`);

      return offset;
    } catch (e) {
      return console.log(e);
    }
  }
};