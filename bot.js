const discord = require('discord.js');
const auth = require('./auth.json');
const logger = require('winston');
const snek = require('snekfetch');
const feedRead = require("davefeedread");
const Sequelize = require('sequelize');
const poolList = require('./pools.json');
const moment = require('moment');

const statsUrl = "https://vpool.io/api/stats";
const waitText = "Please wait 1 minute, I am recharging.";

const embedColor = '#27b7ed';
let item = '';
let rateFrom = 'CryptoBridge';

const talkedRecently = new Set();
const bot = new discord.Client();

const newsfeeds = [
    'https://www.newsbtc.com/feed/',
    'http://feeds.feedburner.com/Coindesk'
];

let lastCmmBtc = 0.000008;
let lastBtcUsd = 7700;
let lastRateFrom = 'CryptoBridge';

let cmmUsd = 0;
let cmmBtc = 0;
let btcUsd = 0;

let sortedPoolsList = [];
let dataTimeStamp = new Date();

let cmmEmoji = {};

const sequelize = new Sequelize('database', 'user', 'password', {
    host: 'localhost',
    dialect: 'sqlite',
    logging: false,
    operatorsAliases: false,
    // SQLite only
    storage: 'database.sqlite',
});

const news = sequelize.define('news', {
    id: {
        type: Sequelize.INTEGER,
        unique: true,
        primaryKey: true,
    },
    url: {
        type: Sequelize.STRING,
        unique: true,
    },
    title: Sequelize.STRING,
    createdAt: Sequelize.DATE,
    updatedAt: Sequelize.DATE,
});

bot.on('ready', () => {
    bot.user.setActivity('Type ?help');
    news.sync();

    setInterval(() => {
        for (let i = 0; i < newsfeeds.length; i++ ) {
            parseNews(newsfeeds[i])
        }
    }, 1000*60*15);


    setInterval(async () => {
        prepareRates();
        preparePoolsList();
        logger.info('Data reloaded!');
    }, 1000 * 60 * 5);

    try {
        cmmEmoji = bot.emojis.find("name", "cmm");
    }
    catch(err) {
        console.error('Emoji error', err);
    }
});
/*
const newUsers = new discord.Collection();
bot.on('guildMemberAdd', member => {
    console.log(member);
});
*/

prepareRates().then(() => {
    preparePoolsList().then(() => {
        bot.login(auth.token).then(() => console.log('Bot login with pre-loaded data'))
    });
});
bot.on('message', async message => {
    if (message.content.substring(0, 1) === '?') {
        let args = message.content.substring(1).split(' ');
        let cmd = args[0];
        let dm = true;
        let validChannel = ['botchat', 'bot-command', 'bot-test'];
        if (validChannel.includes(message.channel.name)) {
            dm = false;
        }
        args = args.splice(1);
        switch (cmd.toLowerCase()) {
            case 'help':
                const hEmbed = new discord.RichEmbed();
                let helpEmbed  = hEmbed
                    .setAuthor('CMMInfoBot', null, 'https://commercium.net')
                    .setColor(embedColor)
                    .setFooter('Commerce Made Modern | Last updated')
                    .setTimestamp()
                    .setTitle('Commercium help')
                    .setDescription(`Checkout Commercium great resources`)
                    .addField('Wallets', "[Client Wallet](https://github.com/CommerciumBlockchain/Commercium/releases) | [Web Wallet](https://wallet.commercium.net)")
                    .addField('Block Explorer', "[Official](https://explorer.commercium.net) | [Explorer 1](http://explorer.commercium.in:3001) | [Explorer 2](http://explorer.chattymining.com)")
                    .addField('Useful links', '[White paper](https://commercium.net/Commercium_White_Paper.pdf) | [ANN](https://bitcointalk.org/index.php?topic=4355691.0)')
                    .addField('Social Media','[Facebook](https://www.facebook.com/cmmblockchain/) | [Twitter](https://twitter.com/cmmblockchain/) | [Reddit](https://www.reddit.com/user/CMMBlockchain/)')
                    .addField('Exchanges','[CryptoBridge](https://wallet.crypto-bridge.org/market/BRIDGE.CMM_BRIDGE.BTC) | [Crex24](https://crex24.com/exchange/CMM-BTC)')
                    .addField('Bot Commands', '`?help` - Show this\n`?stats` - CMM Network Stats\n`?pools` - CMM Pools List\n`?cmm 2500` - Mining profit calculator\n`?donation` - Current donation information\n`?halving` - Halving info');

                sendMessage(dm, message, {embed: helpEmbed});

                break;
            case 'pools':

                item = message.author.id + "_pools";
                if (isCooldown(talkedRecently, item)) {

                    sendMessage(dm, message, waitText, true);

                    break;
                }
                setCooldown(talkedRecently, item);

                let poolFieldValue = '';
                let totalPercentage = 0;
                let totalHashrate = 0;
                for (let i = 0; i < sortedPoolsList.length; i++) {
                    let extra = '';
                    let pName = sortedPoolsList[i].name;
                    let pUrl = sortedPoolsList[i].url;
                    let pFee = sortedPoolsList[i].fee;
                    let pHr = sortedPoolsList[i].hr; //Hashrate
                    let pHrs = sortedPoolsList[i].hrs; //Hashrate String
                    let pPc = sortedPoolsList[i].pc; //Percentage
                    if (sortedPoolsList[i].pc >= 51) {
                        extra = '~~';
                    }
                    poolFieldValue += `${extra}[${pName}](${pUrl}) (Fee: ${pFee}) - **${pHrs}** (${Number(pPc).toFixed(2)}%)${extra}\n`;
                    totalPercentage += pPc;
                    totalHashrate += pHr;
                }

                if (totalPercentage < 100) {
                    poolFieldValue += `Unknown Pool - ${Number(((100-totalPercentage)*totalHashrate/totalPercentage)/1000).toFixed(2)} KSol/s (${Number(100-totalPercentage).toFixed(2)}%)\n`;
                }
                const pEmbed = new discord.RichEmbed();
                let poolsEmbed  = pEmbed
                    .setAuthor('CMMInfoBot', null, 'https://commercium.net')
                    .setColor(embedColor)
                    .setFooter('Last updated')
                    .setTimestamp(dataTimeStamp)
                    .setTitle('Commercium mining pool list')
                    .setDescription('Please spread out the hash to avoid [51% attack](https://www.investopedia.com/terms/1/51-attack.asp)')
                    .addField('Pool list :pick:', poolFieldValue);

                sendMessage(dm, message, {embed: poolsEmbed});

                break;
            case 'stats':
                item = message.author.id + "_stats";
                if (isCooldown(talkedRecently, item)) {

                    sendMessage(dm, message, waitText, true);

                    break;
                }

                setCooldown(talkedRecently, item);
                try {
                    let bb = args[0];
                    const stats = await snek.get(statsUrl);
                    const statsJson = stats.body;
                    const networkStats = statsJson.pools.commercium.poolStats;

                    if (typeof bb !== 'undefined' && bb.toLowerCase() === 'bb') {
                        const bbStats = "```[center][b][color=blue]Commercium statistics[/color][/b]\n" +
                            "This is the overall statistic of Commercium network\n" +
                            "\n" +
                            "[b]Difficulty[/b] \n" +
                            Number(networkStats.networkDiff).toFixed(6)+"\n" +
                            "[b]Network hashrate[/b] \n" +
                            networkStats.networkSolsString+"\n" +
                            "[b]Current Block Height [/b] \n" +
                            networkStats.networkBlocks + "\n" +
                            "[b]Exchange rate (BTC) [/b] \n" +
                            "₿ " + Number(cmmBtc).toFixed(8) + "\n" +
                            "[b]Exchange rate (USD) [/b] \n" +
                            "$ "+Number(cmmUsd).toFixed(3)+"[center]```";
                        sendMessage(dm, message, bbStats);
                        break;
                    }
                    const embed = new discord.RichEmbed();
                    const statsEmbed = {
                        embed: embed
                            .setAuthor('CMMInfoBot', null, 'https://commercium.net')
                            .setColor(embedColor)
                            .setFooter(`Exchange rate of 1 BTC = ${btcUsd} USD was used | Last updated`)
                            .setTimestamp(dataTimeStamp)
                            .setTitle('Commercium statistics')
                            .setDescription('This is the overall statistic of Commercium network')
                            .addField('Difficulty :rocket:', Number(networkStats.networkDiff).toFixed(6))
                            .addField('Network hashrate :zap:', networkStats.networkSolsString)
                            .addField('Current Block Height :pick:', networkStats.networkBlocks)
                            .addField('Best exchange rate :moneybag:', `₿${Number(cmmBtc).toFixed(8)} - $${Number(cmmUsd).toFixed(3)} on **${rateFrom}**`)

                    };

                    sendMessage(dm, message, statsEmbed);
                }
                catch (err) {
                    console.error('Stats err ', err);
                }

                break;
            case 'cmm':
                item = message.author.id + "_cmm";
                if (isCooldown(talkedRecently, item)) {

                    sendMessage(dm, message, waitText, true);

                    break;
                }

                let hr = args[0];
                if (isNaN(hr) || hr > 999999999 || hr <= 0) {
                    break;
                }

                setCooldown(talkedRecently, item);
                try {
                    sendMessage(dm, message, 'Calculating your daily revenue may take several seconds');
                    const miningStats = await snek.get(statsUrl);
                    const miningStatsJson = miningStats.body;
                    const miningInfo = miningStatsJson.pools.commercium.poolStats;
                    const diff = miningInfo.networkDiff;
                    const nethash = miningInfo.networkSolsString;
                    const blockHeight = miningInfo.networkBlocks;
                    const blockReward = 32/Math.ceil((blockHeight*1+1)/420000);

                    let coinPerDay = (blockReward / diff) * ((hr * 86400) / Math.pow(2, 32));
                    coinPerDay = Number(coinPerDay).toFixed(8);

                    let coinPerHour = (blockReward / diff) * ((hr * 3600) / Math.pow(2, 32));
                    coinPerHour = Number(coinPerHour).toFixed(8);

                    const mEmbed = new discord.RichEmbed();
                    let miningEmbed = {
                        embed: mEmbed
                            .setAuthor('CMMInfoBot', null, 'https://commercium.net')
                            .setColor(embedColor)
                            .setFooter(`Exchange rate of 1 BTC = ${btcUsd} USD was used | Last updated`)
                            .setTimestamp()
                            .setTitle('Commercium mining profit calculator')
                            .setDescription(`This is the estimated mining profit for ${message.author} with **${hr} Sol/s**`)
                            .addField('Hourly Revenue :clock1:', `${coinPerHour} CMM - $${Number(coinPerHour * cmmUsd).toFixed(2)}`)
                            .addField('Daily Revenue :dollar:', `${coinPerDay} CMM - $${Number(coinPerDay * cmmUsd).toFixed(2)}`)
                            .addField('Network stats :zap:', `${nethash} | Difficulty ${Number(diff).toFixed(6)}\n`)
                            .addField('Best exchange rate :boom:', `₿${Number(cmmBtc).toFixed(8)} - $${Number(cmmUsd).toFixed(3)} on **${rateFrom}**`)
                    };
                    sendMessage(dm, message, miningEmbed);
                }
                catch (err) {
                    console.error(err);
                }

                break;
            case 'donation':
            case 'donate':
                const address = 'Cdu8ZsAFY9DUQf9mY6jWZuG9QiBDwPcRdo';
                const addressExploreUrl = `https://explorer.commercium.net/address/${address}`;
                const donationBalanceAPI = `https://explorer.commercium.net/api/addr/${address}/balance`;
                const donationBalanceJson = await snek.get(donationBalanceAPI);
                const balance = donationBalanceJson.body/100000000;
                const balanceCMM = Number(balance).toLocaleString('en-US', {
                    style: 'decimal',
                    useGrouping: true,
                    minimumFractionDigits: 8,
                });
                const balanceBTC = Number(balance*cmmBtc).toLocaleString('en-US', {
                    style: 'decimal',
                    useGrouping: true,
                    minimumFractionDigits: 8
                });
                const balanceUSD = Number(balance*cmmUsd).toLocaleString('en-US', {
                    style: 'decimal',
                    useGrouping: true,
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });

                const dEmbed = new discord.RichEmbed();
                let donationEmbed = {
                    embed: dEmbed
                        .setAuthor('CMMInfoBot', null, 'https://commercium.net')
                        .setColor(embedColor)
                        .setFooter('Commerce Made Modern | Last updated')
                        .setTimestamp()
                        .setTitle('Commercium donation information')
                        .setDescription(`This is the information of current CMM community donation.\nThe fund will be used to listed exchanges`)
                        .addField('Donation address', `\`${address}\`\n:link:[Check on explorer](${addressExploreUrl})`)
                        .addField(`Balance CMM`, `${balanceCMM}`, true)
                        .addField('Balance BTC', `${balanceBTC}`, true)
                        .addField('Balance USD', `${balanceUSD}`, true)
                        .addField(`:muscle:${cmmEmoji}`, `Thank you very much for your contribution!\nMake sure to check out the #donation channel.`)
                };

                sendMessage(dm, message, donationEmbed);
                break;
            case 'halving':
                const stats = await snek.get(statsUrl);
                const statsJson = stats.body;
                const networkStats = statsJson.pools.commercium.poolStats;
                const height = networkStats.networkBlocks;
                let blockToHavling = 420000 - (height % 420000);
                let duration = 30;
                duration = moment.duration({second: blockToHavling*30});

                const haEmbed = new discord.RichEmbed();
                let halvingEmbed = {
                    embed: haEmbed
                        .setAuthor('CMMInfoBot', null, 'https://commercium.net')
                        .setColor(embedColor)
                        .setFooter('Commerce Made Modern | Last updated')
                        .setTimestamp()
                        .setDescription('Commercium halving info')
                        .addField('Block height ', `${height}`)
                        .addField(`Blocks till halving`, `${blockToHavling}`)
                        .addField('Estimated time till halving', `${duration.get('months')}m ${duration.get('days')}d ${duration.get('hours')}h ${duration.get('minutes')}m`)
                };
                sendMessage(dm, message, halvingEmbed);
                break;

            case 'when':
                let what = args[0];

                if (what === 'moon') {
                    let moonMess = 'Neil Armstrong and Buzz Aldrin were on the moon in 1969,  CMM plans to reach the moon soon™';
                    sendMessage(dm, message, moonMess);
                }
                else if (what === 'lambo') {
                    let lamboMess = `You can buy a 2018 Lamborghini Huracan view 5 trims with *only* **${Math.floor(280000/cmmUsd)} CMM** at the current rate.`;

                    sendMessage(dm, message, lamboMess);
                }

                break;
        }

    }
});

function sendMessage(isDM, source, message, isMention) {
    if (isDM) {
        source.author.send(message);
    }
    else {
        if (isMention) {
            message = message + " " + source.author;
        }
        source.channel.send(message);
    }
}

function isCooldown(waitingPool, item) {
    return waitingPool.has(item);
}

function setCooldown(waitingPool, item) {
    waitingPool.add(item);
    setTimeout(() => {
        waitingPool.delete(item);
    }, 60000);
}

async function parseNews(url) {
    const timeOutSecs = 30;

    const triggers = ['SEC', 'CSA', 'OSC', 'CFTC', 'CME', 'CBOE', 'AMD', 'Intel', 'Nvidia',
        'Bitcoin', 'blockchain', 'Apple', 'Amazon', 'Google', 'Microsoft',
        'commerce', 'business', 'law', 'legal', 'financial', 'hack', 'hacked',
        'chains', 'chairman', 'CEO', 'board', 'bank', 'cmm', 'commercium', 'cmmx', 'End of Month Roundup'];
    const banned = ['technical', 'analysis', 'bearish', 'bullish', 'trading', 'trade', 'opinion',
        'sponsored', 'price', 'watch'];
    feedRead.parseUrl(url, timeOutSecs, async function (err, theFeed) {
        if (err) {
            console.log(err.message);
        }
        else {
            for (let j = 0; j < theFeed.items.length; j++) {
                let exclude = false;
                for (let k = 0; k < banned.length; k++) {
                    if (theFeed.items[j].title.toLowerCase().includes(banned[k])) {
                        exclude = true;
                        break;
                    }
                }

                if (exclude) {
                    continue;
                }

                for (let k = 0; k < triggers.length; k++) {
                    if (theFeed.items[j].title.toLowerCase().includes(triggers[k])) {
                        const link = await news.findOne({ where: { url: theFeed.items[j].link } });
                        if (link) {
                            continue;
                        }

                        bot.channels.find('name', 'news').send(theFeed.items[j].title+"\n"+theFeed.items[j].link)
                            .then(msg => {
                                news.create({
                                url: theFeed.items[j].link,
                                title: theFeed.items[j].title,
                            });
                        }).catch(err => {});

                        break;
                    }
                }
            }
        }
    });
}
async function preparePoolsList() {
    let unsortedList = [];
    let lastNethash = 1;
    for (let i = 0; i < poolList.length; i++) {
        let poolHashStr = "0 Sol/s";
        let poolHashrate = 0;
        let nethashForPool = 1;
        let percentage = 0;
        try {
            let poolStats = await snek.get(poolList[i].apiUrl);
            let statsJson = poolStats.body;

            if (poolList[i].name === 'zpool') {
                statsJson = JSON.parse(statsJson);
                poolHashrate = statsJson.CMM.hashrate;
                if (poolHashrate >= 1000000000) {
                    poolHashStr = Number(poolHashrate / 1000000000).toFixed(2) + ' GSol/s';
                }
                if (poolHashrate >= 1000000) {
                    poolHashStr = Number(poolHashrate / 1000000).toFixed(2) + ' MSol/s';
                }
                else if (poolHashrate >= 1000) {
                    poolHashStr = Number(poolHashrate / 1000).toFixed(2) + ' KSol/s';
                }
                else {
                    poolHashStr = poolHashrate + ' Sol/s';
                }
                nethashForPool = lastNethash;
            }
            else {
                poolHashStr = statsJson.pools[poolList[i].pool].hashrateString;
                poolHashrate = statsJson.pools[poolList[i].pool].hashrate * 2 / 1000000;
                nethashForPool = statsJson.pools[poolList[i].pool].poolStats.networkSols;
                lastNethash = nethashForPool;
            }

            percentage = poolHashrate / nethashForPool * 100;

            let poolData = {
                name: poolList[i].name,
                url: poolList[i].url,
                hrs: poolHashStr,
                hr: poolHashrate,
                pc: percentage,
                fee: poolList[i].fee
            };
            unsortedList.push(poolData);
        }
        catch (e) {
            console.error(poolList[i].name, e);
        }
    }
    sortedPoolsList = unsortedList.sort((a, b) => {
        if (a.pc === b.pc) return 0;

        return a.pc < b.pc ? -1 : 1;
    });

    dataTimeStamp = new Date();
}

async function prepareRates() {
    btcUsd = await fetchBtcUsd();
    cmmBtc = await fetchCmmBtc();

    if (btcUsd === 0 || cmmBtc === 0) {
        btcUsd = lastBtcUsd;
        cmmBtc = lastCmmBtc;
    }
    else {
        lastBtcUsd = btcUsd;
        lastCmmBtc = cmmBtc;
    }

    cmmUsd = btcUsd * cmmBtc;
}
async function fetchCmmBtc() {
    let rate = await fetchCmmBtcFromCB();
    let rate2 = await fetchCmmBtcFromCrex();

    if (rate2 > rate) {
        rate = rate2;
        rateFrom = 'Crex24';
        lastRateFrom = rateFrom;
    }
    else if (rate > 0) {
        rateFrom = 'CryptoBridge';
        lastRateFrom = rateFrom;
    }

    return rate;
}

async function fetchCmmBtcFromCB() {
    const CBApi = "https://api.crypto-bridge.org/api/v1/ticker";
    let rate = 0;
    try {
        const response = await snek.get(CBApi);
        const json = response.body;

        for (let i = 0; i < json.length; i++) {
            let pair = json[i];
            if (pair.id === 'CMM_BTC') {
                rate = pair.ask;
                break;
            }
        }
    }
    catch (err) {
        console.log(err);
    }

    return rate;
}

async function fetchCmmBtcFromCrex() {
    const CrexAPI = "https://api.crex24.com/v2/public/orderBook?instrument=CMM-BTC";
    let rate = 0;
    try {
        const response = await snek.get(CrexAPI);
        const json = response.body;
        rate = json.sellLevels[0].price;
    }
    catch (err) {
        console.log(err);
    }

    return rate;
}

async function fetchBtcUsd() {
    let rate = await fetchBtcUsdFromCMC();
    if (rate === 0) {
        rate = await fetchBtcUsdFromCoinbase();
    }

    return rate;
}

async function fetchBtcUsdFromCMC() {
    const btcUsdCMC = "https://api.coinmarketcap.com/v2/ticker/1/";

    let rate = 0;
    try {
        const response = await snek.get(btcUsdCMC);
        const json = response.body;
        rate = json.data.quotes.USD.price
    }
    catch (err) {
        console.log(err);
    }

    return rate;
}

async function fetchBtcUsdFromCoinbase() {
    const btcUsdCoinbase = "https://api.coinbase.com/v2/prices/BTC_USD/spot";

    let rate = 0;
    try {
        const response = await snek.get(btcUsdCoinbase);
        const json = response.body;
        rate = json.data.ammount
    }
    catch (err) {
        console.log(err);
    }

    return rate;
}
