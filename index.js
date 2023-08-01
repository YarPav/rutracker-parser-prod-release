import axios from 'axios';
import iconv from "iconv-lite";
import { parse } from "node-html-parser";
import mongoose from "mongoose";
import 'dotenv/config';
import Category from "./models/category.js";
import Topic from "./models/topic.js";

const HOST = 'rutracker.org';
const URL = `https://${HOST}/`;
let SESSION_TOKEN = null;
let FORM_TOKEN = null;
const MONGO_URL = process.env.DB_URL;
const TOPICS_ON_PAGE = 50;
const login = async () => {
    const body = new URLSearchParams();
    body.append('login_username', process.env.LOGIN);
    body.append('login_password', process.env.PASSWORD);
    body.append('login', 'Вход');
    try {
        const res = await axios({
            url: `${URL}forum/login.php`,
            method: 'POST',
            data: body,
            maxRedirects: 0,
            validateStatus(status) {
                return status === 302;
            }
        });
        const sessionToken = res.headers['set-cookie']
            .find(cookie => cookie.includes('bb_session'))
            .split(`bb_session=`).pop().split(';').shift();
        return sessionToken;
    } catch (e) {
        return console.log(new Error('Authentication error'));
    }

}

const getFormToken = async () => {
    const axiosIndex = await axios.request({
        url: `${URL}forum/index.php`,
        responseType: 'arraybuffer',
        method: 'GET',
        headers: {
            Cookie: `bb_session=${SESSION_TOKEN}; path=/; domain=.${HOST}; HttpOnly`,
        }
    });
    return parse(iconv.decode(axiosIndex.data, 'win1251')).querySelector('head script').textContent.split("form_token: '").pop().split("'").shift();
}

const writeCategories = async () => {
    const axiosTracker = await axios.request({
        url: `${URL}forum/tracker.php`,
        responseType: 'arraybuffer',
        method: 'GET',
        headers: {
            Cookie: `bb_session=${SESSION_TOKEN}; path=/; domain=.${HOST}; HttpOnly`,
        }
    });
    const root = parse(iconv.decode(axiosTracker.data, 'win1251'));
    const categories = root.querySelectorAll('select#fs-main optgroup');
    for (const category of categories) {
        const categoryModel = new Category({
            title: category.getAttribute('label'),
            categoryId: -1,
            subCategories: []
        });
        const subCategories = category.querySelectorAll('option');
        let subCategoryModel = new Category({});
        let isSubCategory = false;
        for (const subCategory of subCategories) {
            if (subCategory.classList.contains('has_sf')) {
                if (isSubCategory) {
                    categoryModel.subCategories.push(subCategoryModel);
                }
                subCategoryModel.title = subCategory.textContent;
                subCategoryModel.categoryId = subCategory.getAttribute('value');
                isSubCategory = true;
                continue;
            }
            if (isSubCategory) {
                subCategoryModel.subCategories.push({
                    title: subCategory.textContent,
                    categoryId: subCategory.getAttribute('value'),
                });
            } else {
                categoryModel.subCategories.push({
                    title: subCategory.textContent,
                    categoryId: subCategory.getAttribute('value'),
                });
            }
        }
        if (isSubCategory) {
            categoryModel.subCategories.push(subCategoryModel);
        }
        try {
            await categoryModel.save();
            console.log(`Category has been saved with id ${categoryModel.id}`);
        } catch (e) {
            throw new Error(e);
        }
    }
}

const writeTopics = async (ids, count) => {
    let parsedTopics = 0;
    for (let page = 1; page <= Math.ceil(count / TOPICS_ON_PAGE); page++) {
        if (!Array.isArray(ids)) {
            return console.log(new TypeError('Ids field must contain an array of category ids'));
        }
        const axiosCategory = await axios.request({
            url: `${URL}forum/tracker.php?f=${ids.join(',')}&start=${(page - 1) * TOPICS_ON_PAGE}`,
            responseType: 'arraybuffer',
            method: 'GET',
            headers: {
                Cookie: `bb_session=${SESSION_TOKEN}; path=/; domain=.${HOST}; HttpOnly`
            }
        });
        const root = parse(iconv.decode(axiosCategory.data, 'win1251'));
        const titles = root.querySelectorAll('.t-title a');
        for (const title of titles) {
            const topicId = title.getAttribute('data-topic_id');
            if (parsedTopics >= count) {
                break;
            }
            const axiosTopic = await axios.request({
                url: `${URL}forum/viewtopic.php?t=${topicId}`,
                responseType: 'arraybuffer',
                method: 'GET',
                headers: {
                    Cookie: `bb_session=${SESSION_TOKEN}; path=/; domain=.${HOST}; HttpOnly`,
                }
            });
            const root = parse(iconv.decode(axiosTopic.data, 'win1251'));
            const topicTitle = root.querySelector('h1.maintitle a').textContent;
            let topicDescription = '';
            const topicDate = root.querySelector('.post-time a').textContent;
            const topicAuthor = root.querySelector('.nick-author').textContent;
            const topicMagnetLink = `${URL}forum/${root.querySelector('a.magnet-link').getAttribute('href')}`;
            const topicTorrentLink = `${URL}forum/${root.querySelector('a.dl-link').getAttribute('href')}`;
            let topicBody = root.querySelector('div.post_body').childNodes;
            const startIndex = topicBody.findIndex(i => i.textContent.toLowerCase().includes('описание'));
            topicBody = topicBody.slice(startIndex+1);
            const endIndex = topicBody.findIndex(i => i?.tagName === 'DIV' || i?.classList?.contains('post-b'));
            topicDescription = topicBody.slice(0, endIndex).map(i => i.textContent).join(' ').trim();
            if (topicDescription[0] === ':') {
                topicDescription = topicDescription.slice(1).trim();
            }
            const topicModel = new Topic({
                title: topicTitle,
                description: topicDescription,
                addedDate: topicDate,
                authorName: topicAuthor,
                magnetLink: topicMagnetLink,
                torrentLink: topicTorrentLink,
                lastThanked: []
            });
            if (FORM_TOKEN) {
                const axiosThankedBody = new URLSearchParams();
                axiosThankedBody.append('action', 'thx');
                axiosThankedBody.append('mode', 'get');
                axiosThankedBody.append('topic_id', topicId);
                axiosThankedBody.append('t_hash', root.querySelector('div#thx-block').previousElementSibling.previousElementSibling.textContent.split("t_hash: '").pop().split("'").shift());
                axiosThankedBody.append('form_token', FORM_TOKEN);
                const axiosThanked = await axios({
                    url: `${URL}forum/ajax.php`,
                    method: 'POST',
                    data: axiosThankedBody,
                    headers: {
                        Cookie: `bb_session=${SESSION_TOKEN}; path=/; domain=.${HOST}; HttpOnly`,
                    }
                });
                try {
                    const thankedDoc = parse(axiosThanked.data.html).querySelectorAll('b');
                    thankedDoc.forEach(i => {
                        topicModel.lastThanked.push({
                            name: i.textContent.split(' ').shift(),
                            thankedDate: i.textContent.split(' ').pop().slice(1, -1)
                        });
                    });
                } catch (e) {
                    console.log('Could not get last thanked');
                }
            }
            try {
                await topicModel.save();
                console.log(`Topic has been saved with id ${topicModel.id}`);
            } catch (e) {
                throw new Error(e);
            }
            parsedTopics++;
        }
    }
}

const categoryTest = async () => {
    try {
        // Подключение к базе данных
        const mongooseConnection = await mongoose.connect(MONGO_URL);
        console.log('Connected to database');
        // Получение токена, для эмуляции аутентификации в последующих запросах
        SESSION_TOKEN = await login();
        // Получение токена, для последующей отправки запросов на получение "последних поблагодаривших"
        FORM_TOKEN = await getFormToken();
        // Отчистка коллекции, для упрощения тестирования
        await Category.deleteMany({});
        // Получение и запись данных
        await writeCategories();
        // Отключение от базы данных
        await mongooseConnection.disconnect();
    } catch (e) {
        console.log(e);
    }
};

const topicTest = async () => {
    try {
        // Подключение к базе данных
        const mongooseConnection = await mongoose.connect(MONGO_URL);
        console.log('Connected to database');
        // Получение токена, для эмуляции аутентификации в последующих запросах
        SESSION_TOKEN = await login();
        // Получение токена, для последующей отправки запросов на получение "последних поблагодаривших"
        FORM_TOKEN = await getFormToken();
        // Отчистка коллекции, для упрощения тестирования
        await Topic.deleteMany({});
        // Получение и запись данных
        await writeTopics([1445,2485,941], 11);
        // Отключение от базы данных
        await mongooseConnection.disconnect();
    } catch (e) {
        console.log(e);
    }
};

// await categoryTest();
await topicTest();
