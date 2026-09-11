// ==UserScript==
// @name        Kakach Extension Tools
// @author      Original by postman, ayakudere, theanonym; forked by Ananim; modernized by malweena
// @description Какаческрипт с блэкджеком и шлюхами (какач онли)
// @version     2.0.4 (ca)
// @icon        https://web.archive.org/web/20260616043953im_/https://1chan.ca/ico/favicons/1chan.ca.png
// @downloadURL https://github.com/Malweena/Kakach-Extension-Tools/raw/master/Kakachuserscript.user.js
// @match       https://1chan.ca/*
// @match       https://*.1chan.ca/*
// @grant       GM_xmlhttpRequest
// @grant       GM.xmlHttpRequest
// @connect     web.archive.org
// @connect     i.imgur.com
// @connect     imgur.com
// @connect     1chan.ca
// @connect     *.1chan.ca
// ==/UserScript==

(function(document) {

    // Из-за @grant GM_xmlhttpRequest скрипт может работать в песочнице
    // расширения, где страничная jQuery видна только через unsafeWindow
    var $ = window.$ || window.jQuery ||
        (typeof unsafeWindow !== 'undefined' && (unsafeWindow.$ || unsafeWindow.jQuery));

    // Globals
    var formTextarea;
    var deletingSmiles;
    var locationPrefix;
    var hidePatterns;
    var repliesTable = {};
    var locationPrefix = /\.(?:[a-z]{2,})\/([^/]+)/.exec(document.URL)[1]

    const features = [
        'answermap',
        'hiding',
        'smiles',
        'markup',
        'spoilers',
        'img-spoilers',
        'show-hidden',
        'recursive-hidding',
        'panel-hiding',
        'markup-top',
        'hide-short-news',
        'scroll-buttons'
    ];
    const descriptions = [
        'Построение карты ответов',
        'Скрытие постов',
        'Панель смайлов',
        'Панель разметки',
        'Раскрытие спойлеров текста',
        'Раскрытие спойлеров картинок',
        'Показывать скрытые комментарии',
        'Скрывать ответы на скрытый пост',
        'Убирать панель по клику',
        'Разметка над формой',
        'Скрывать новости короче 140 символов',
        'Кнопки навигации'
    ];
    const icons = {
        'smilesKakachOnly': "https://web.archive.org/web/20260616043953im_/https://1chan.ca/ico/favicons/1chan.ca.png",
        'smilesAll': "https://web.archive.org/web/20260105173919im_/https://wiki.1chan.ca/images/faviconwiki.ico",
        'hide': "https://web.archive.org/web/20110225131301im_/http://static.1chan.ru/ico/oh-my-eyes.png",
        'show': "https://web.archive.org/web/20110225131301im_/http://static.1chan.ru/ico/oh-my-eyes.png",
        'addSmile': "https://web.archive.org/web/20220515043627if_/https://cdn1.iconfinder.com/data/icons/basicset/plus_16.png",
        'redCross': "https://web.archive.org/web/20220606134547if_/https://1chan.su/ico/remove.gif",
        'whiteCross': "https://web.archive.org/web/20220529165839if_/https://1chan.su/ico/delete.gif",
        'settings': "https://web.archive.org/web/20190103061912if_/http://cdn1.iconfinder.com/data/icons/munich/16x16/settings.png",
        'regexp': "https://web.archive.org/web/20120211134716if_/http://vll.java.net/images/GrammarIconRegex.gif"
    }
    var enabledFeatures;
    const VERSION = '100';

    var settingsPosition = 'both';

    var smileyDefinitions = null;
    var smileySizeCache = {};
    var smileySizePending = {};

    // Режим панели смайликов: 'smilesAll' или 'smilesKakachOnly'
    var smilesMode = 'smilesAll';

   /*
    *      Локальная копия движка шаблонов сайта:
    *      глобальная template() спрятана в замыкании production.js
    *      и на части страниц юзерскрипту недоступна
    */

    var ketTemplateCache = {};

    function ketTemplate(str, data) {
        var fn = !/\W/.test(str) ?
            ketTemplateCache[str] = ketTemplateCache[str] ||
                ketTemplate(document.getElementById(str).value) :

            new Function("obj",
                "var p=[],print=function(){p.push.apply(p,arguments);};" +
                "with(obj){p.push('" +
                str
                    .replace(/[\r\t\n]/g, " ")
                    .split("<%").join("\t")
                    .replace(/((^|%>)[^\t]*)'/g, "$1\r")
                    .replace(/\t=(.*?)%>/g, "',$1,'")
                    .split("\t").join("');")
                    .split("%>").join("p.push('")
                    .split("\r").join("\\'")
                + "');}return p.join('');");

        return data ? fn(data) : fn;
    }

    function renderTemplate(str, data) {
        if (typeof window.template === 'function') {
            try {
                return window.template(str, data);
            } catch(e) {}
        }

        if (!document.getElementById(str))
            return null;

        try {
            return ketTemplate(str, data);
        } catch(e) {
            return null;
        }
    }

   /*
    *      focus() без прокрутки страницы к полю ввода
    *      (иначе клик по смайлу/разметке подбрасывает к форме)
    */

    function focusNoScroll(el) {
        if (!el)
            return;

        try {
            el.focus({ preventScroll: true });
        } catch(e) {
            var x = window.pageXOffset;
            var y = window.pageYOffset;
            el.focus();
            window.scrollTo(x, y);
        }
    }

   /*
    *      Кэш картинок скрипта: иконки и смайлы с web.archive.org
    *      (и imgur, и самого 1chan.ca) грузятся мучительно долго,
    *      поэтому каждая картинка один раз скачивается fetch'ем,
    *      складывается блобом в IndexedDB и дальше показывается
    *      через blob-URL вообще без обращений к сети
    */

    var ketImgMemCache = {};      // url -> blob-url
    var ketImgPending = {};       // url -> [callback]
    var ketImgDB = null;
    var ketImgDBState = 'init';   // init | ready | failed
    var ketImgDBWaiters = [];

    function ketImgCacheInit() {
        if (!window.indexedDB) {
            ketImgDBState = 'failed';
            return;
        }

        var finish = function(state, db) {
            if (ketImgDBState != 'init')
                return;
            ketImgDBState = state;
            ketImgDB = db;
            var waiters = ketImgDBWaiters;
            ketImgDBWaiters = [];
            for(var i = 0; i < waiters.length; i++)
                waiters[i]();
        };

        try {
            var req = indexedDB.open('ket-imgcache', 1);

            req.onupgradeneeded = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains('images'))
                    db.createObjectStore('images');
            };
            req.onsuccess = function(e) { finish('ready', e.target.result); };
            req.onerror = function() { finish('failed', null); };
            req.onblocked = function() { finish('failed', null); };

            // страховка от зависшего открытия базы
            setTimeout(function() { finish('failed', null); }, 3000);
        } catch(e) {
            finish('failed', null);
        }
    }

    function ketImgWhenDBReady(cb) {
        if (ketImgDBState == 'init')
            ketImgDBWaiters.push(cb);
        else
            cb();
    }

    function ketImgDBGet(url, cb) {
        ketImgWhenDBReady(function() {
            if (ketImgDBState != 'ready') { cb(null); return; }
            try {
                var rq = ketImgDB.transaction('images', 'readonly')
                    .objectStore('images')
                    .get(url);
                rq.onsuccess = function() { cb(rq.result || null); };
                rq.onerror = function() { cb(null); };
            } catch(e) { cb(null); }
        });
    }

    function ketImgDBPut(url, blob) {
        ketImgWhenDBReady(function() {
            if (ketImgDBState != 'ready') return;
            try {
                ketImgDB.transaction('images', 'readwrite')
                    .objectStore('images')
                    .put(blob, url);
            } catch(e) {}
        });
    }

   /*
    *      GM_xmlhttpRequest не подчиняется CORS — это единственный
    *      способ забрать байты с web.archive.org (там нет заголовка
    *      Access-Control-Allow-Origin, обычный fetch блокируется)
    */

    function ketImgGMXHR(url) {
        return new Promise(function(resolve, reject) {
            var xhrFn = null;

            if (typeof GM !== 'undefined' && GM.xmlHttpRequest)
                xhrFn = GM.xmlHttpRequest;
            else if (typeof GM_xmlhttpRequest !== 'undefined')
                xhrFn = GM_xmlhttpRequest;

            if (!xhrFn) {
                reject(new Error('GM_xmlhttpRequest недоступен'));
                return;
            }

            xhrFn({
                method: 'GET',
                url: url,
                responseType: 'blob',
                onload: function(resp) {
                    var blob = resp.response;
                    if (
                        resp.status >= 200 && resp.status < 300 &&
                        blob && blob.size
                    )
                        resolve(blob);
                    else
                        reject(new Error('HTTP ' + resp.status));
                },
                onerror: function() { reject(new Error('network error')); },
                ontimeout: function() { reject(new Error('timeout')); }
            });
        });
    }

   /*
    *      Promise<Blob>: свой хост — обычный fetch (CORS не нужен),
    *      чужие хосты — сразу GM_xhr; fetch для чужих — только когда
    *      GM_xhr недоступен (напр. imgur отдаёт Access-Control-Allow-*)
    */

    function ketImgFetchBlob(url) {
        var sameOrigin =
            url.indexOf(location.protocol + '//' + location.host + '/') === 0 ||
            url.charAt(0) == '/';

        var haveGM =
            (typeof GM !== 'undefined' && GM.xmlHttpRequest) ||
            (typeof GM_xmlhttpRequest !== 'undefined');

        if (sameOrigin || !haveGM) {
            return fetch(url).then(function(resp) {
                if (!resp.ok)
                    throw new Error('HTTP ' + resp.status);
                return resp.blob();
            });
        }

        return ketImgGMXHR(url);
    }

   /*
    *      Резолвит url картинки в blob-url из кэша. Колбэк
    *      вызывается ровно один раз; при любой ошибке отдаётся
    *      исходный url (картинка грузится сетью, как раньше)
    */

    function ketImgResolve(url, cb) {
        if (ketImgMemCache[url]) {
            cb(ketImgMemCache[url]);
            return;
        }

        if (ketImgPending[url]) {
            ketImgPending[url].push(cb);
            return;
        }
        ketImgPending[url] = [cb];

        var done = function(cachedUrl) {
            var cbs = ketImgPending[url] || [];
            delete ketImgPending[url];
            if (cachedUrl)
                ketImgMemCache[url] = cachedUrl;
            for(var i = 0; i < cbs.length; i++)
                cbs[i](cachedUrl || url);
        };

        ketImgDBGet(url, function(blob) {
            if (blob) {
                done(URL.createObjectURL(blob));
                return;
            }

            ketImgFetchBlob(url)
                .then(function(blob) {
                    // HTML-страницы ошибок в кэш не пишем
                    if (
                        !blob ||
                        !blob.size ||
                        (blob.type && !/^image\//.test(blob.type))
                    )
                        throw new Error('not an image');
                    ketImgDBPut(url, blob);
                    done(URL.createObjectURL(blob));
                })
                .catch(function() { done(null); });
        });
    }

   /*
    *      Ставит img.src через кэш: пока кэш холодный — оригинальный
    *      url (картинка видна сразу), после прогрева src подменяется
    *      на blob-url
    */

    function ketImg(el, url) {
        if (!el || !url)
            return;

        el.setAttribute('data-ket-img', url);

        if (ketImgMemCache[url]) {
            el.src = ketImgMemCache[url];
            return;
        }

        el.src = url;

        ketImgResolve(url, function(cachedUrl) {
            // подменяем, только если элементу за это время
            // не поставили другую картинку (тогглы иконок)
            if (el.getAttribute('data-ket-img') == url)
                el.src = cachedUrl;
        });
    }

    function ketImgPreload() {
        var urls = [];
        var i, key;

        for(var k in icons)
            urls.push(icons[k]);

        var defs = getSmileyDefinitions();
        for(i = 0; i < defs.length; i++)
            urls.push(defs[i].url);

        urls.push('https://1chan.ca/ico/new.png');

        // пользовательские смайлы и картинки
        for(i = 0; i < localStorage.length; i++) {
            key = localStorage.key(i);
            if (/^smile-/.test(key) || /^image-.+$/.test(key))
                urls.push(localStorage.getItem(key));
        }

        for(i = 0; i < urls.length; i++)
            ketImgResolve(urls[i], function() {});
    }

    var gifSmileList = [
        "coolface", "desu", "nyan", "sobak", "trollface",
        "makak", "popka", "popka2", "slon", "pauk",
        "cheez", "weed"
    ];

    var pngSmileList = [
        "awesome", "ffuu", "okay", "rage", "doge", "oru",
        "deb", "sheez", "spice", "hero", "shprits",
        "yajka", "ssaksa", "mouse", "lips", "omsk", "rooster"
    ];

    var gifSmileListSVIN = [
        "kolkun", "mrgreen", "poodel", "sobaken",
        "sosak", "turtle", "cancer", "droch"
    ];

    var pngSmileListSVIN = [
        "Jlby", "JlbyHD", "JlbyPride", "aftersex", "boyar",
        "hazard", "jackdaniels", "loo", "ooo", "ngcat",
        "tacgn", "oooo", "ol", "joseph", "mic", "monies",
        "nemiroff", "no", "yes", "pizda", "plombir",
        "pork", "proj", "projector", "sega",
        "shekoder", "srunka", "you"
    ];


   /*
    *      Replies map
    */

    var answersPreviewTimeout = null;
    var answersPreviewActive = false;
    var answersPreviewActiveLink = null;


    function answersCommentPreview(node, clone) {
        clone = clone || false;

        var links;

        if (clone) {
            links = $(".js-cross-link", node);
        } else {
            links = $(node);
        }

        links.mouseover(function(e) {

            if (!$(this).data("preview_open"))
            {
                if (!clone && answersPreviewActiveLink) {
                    $(".b-comment.m-tip").remove();

                    $(answersPreviewActiveLink)
                        .data("preview_open", false);

                    answersPreviewActiveLink = this;

                } else if (!answersPreviewActiveLink) {
                    answersPreviewActiveLink = this;
                }

                answersPreviewActive = true;

                answersPreviewTimeout =
                    clearTimeout(
                        answersPreviewTimeout
                    );

                // board/id берём из атрибута name ссылки (как это
                // делает сам движок), разбор текста — запасной вариант
                var fullId =
                    ($(this).attr("name") || "").split("/", 2);

                var board, id;

                if (fullId.length > 1 && fullId[1]) {
                    board = fullId[0];
                    id = fullId[1];
                } else {
                    board = locationPrefix;
                    id =
                        $(this)
                            .text()
                            .replace(/\D/g, "");
                }

                // На досках id комментариев — comment_<board>_<id>,
                // голый comment_<id> есть только в /news/
                var el =
                    board == 'news'
                        ? $("#comment_" + id)
                        : $("#comment_" + board + "_" + id);

                if (el.length != 0) {

                    var tip =
                        $(el)
                            .clone()
                            .mouseover(function(e) {

                                answersPreviewTimeout =
                                    clearTimeout(
                                        answersPreviewTimeout
                                    );

                                e.stopPropagation();

                            })
                            .addClass("m-tip")
                            .attr("id", "")
                            .css({
                                display: "block",
                                width: "450px",
                                position: "absolute",
                                top: e.pageY + 8,
                                left: e.pageX + 8
                            });

                    $(document.body).append(tip);

                    tip.slideUp(0).slideDown(300);

                    $(this)
                        .data(
                            "preview_open",
                            true
                        );

                    answersCommentPreview(
                        tip,
                        true
                    );

                } else {

                    var link_ = this;

                    $.getJSON(
                        board == 'news'
                            ? location.protocol +
                            "//" +
                            location.host +
                            "/news/last_comments/"
                            : location.protocol +
                            "//" +
                            location.host +
                            "/" + board + "/get/",
                        {
                            id: id
                        },
                        function(data, status) {

                            if (
                                status != "error" &&
                                data != false
                            ) {

                                var tipHtml =
                                    renderTemplate(
                                        "template_comment",
                                        data
                                    );

                                if (!tipHtml)
                                    return;

                                var tip =
                                    $(tipHtml)
                                    .mouseover(function(e) {

                                        answersPreviewTimeout =
                                            clearTimeout(
                                                answersPreviewTimeout
                                            );

                                        e.stopPropagation();

                                    })
                                    .addClass("m-tip")
                                    .attr("id", "")
                                    .css({
                                        display: "block",
                                        width:
                                            board == 'news' &&
                                            data.post_preview
                                                ? "520px"
                                                : "450px",
                                        position: "absolute",
                                        top: e.pageY + 8,
                                        left: e.pageX + 8
                                    });

                                // Шапку с названием поста имеет смысл
                                // дорисовывать только в /news/ — у досок
                                // в ответе /get/ этих полей нет
                                if (board == 'news' && data.post_preview) {

                                    tip
                                        .addClass(
                                            "m-post-preview"
                                        )
                                        .find(".js-comment-id")
                                        .html(
                                            '<a href="' +
                                            location.protocol +
                                            '//' +
                                            location.host +
                                            '/news/res/' +
                                            data.post_id +
                                            '/">' +
                                            data.post_title +
                                            '</a> ' +
                                            '(<em>открывающий пост</em>)'
                                        );

                                } else if (board == 'news') {

                                    tip
                                        .find(".js-comment-id")
                                        .prepend(
                                            '<a href="' +
                                            location.protocol +
                                            '//' +
                                            location.host +
                                            '/news/res/' +
                                            data.post_id +
                                            '/">' +
                                            data.post_title +
                                            '</a> '
                                        );
                                }

                                $(document.body)
                                    .append(tip);

                                tip.slideUp(0)
                                    .slideDown(300);

                                $(link_)
                                    .data(
                                        "preview_open",
                                        true
                                    );

                                answersCommentPreview(
                                    tip,
                                    true
                                );
                            }
                        }
                    );
                }
            }

            e.stopPropagation();
        });
    }


    function initAnswersPreview() {
        $(document.body).mouseover(function(e) {

            if (
                !answersPreviewTimeout &&
                answersPreviewActive
            ) {
                answersPreviewTimeout =
                    setTimeout(function() {

                        $(".b-comment.m-tip").remove();

                        $(answersPreviewActiveLink)
                            .data(
                                "preview_open",
                                false
                            );

                        answersPreviewActiveLink =
                            null;

                        answersPreviewActive =
                            false;

                    }, 400);
            }
        });

        var links =
            document.querySelectorAll(
                '[id^="answers_"] .js-cross-link'
            );


        var originalCrossLinks =
            $(".js-cross-link");

        originalCrossLinks.each(function() {

            if (
                $(this).closest(
                    '[id^="answers_"]'
                ).length
            ) {
                answersCommentPreview(
                    this.parentNode
                );
            }
        });
    }

    function rebindAnswersPreview() {
        var links =
            document.querySelectorAll(
                '[id^="answers_"] .js-cross-link'
            );

        for(var i = 0; i < links.length; i++) {
            answersCommentPreview(
                links[i],
                false
            );
        }
    }

    function initAnswersPreviewCloser() {
        $(document.body).mouseover(function(e) {

            if (
                !answersPreviewTimeout &&
                answersPreviewActive
            ) {
                answersPreviewTimeout =
                    setTimeout(function() {

                        $(".b-comment.m-tip").remove();

                        $(answersPreviewActiveLink)
                            .data(
                                "preview_open",
                                false
                            );

                        answersPreviewActiveLink =
                            null;

                        answersPreviewActive =
                            false;

                    }, 400);
            }
        });
    }

    function createRepliesMap() {
        // Карта перестраивается целиком: сначала сносим старые
        // блоки «Ответы:», иначе при повторном запуске они задублируются
        var oldAnswers = document.querySelectorAll('[id^="answers_"]');
        for(var i = 0; i < oldAnswers.length; i++)
            oldAnswers[i].parentNode.removeChild(oldAnswers[i]);

        repliesTable = {};
        var comments = document.getElementsByClassName("b-comment");

        for(var i=0; i<comments.length; i++) {
            // пропускаем превью-клоны (.m-tip, id снят) и прочие
            // элементы с классом b-comment (например, окно настроек)
            if(!/^comment_/.test(comments[i].id))
                continue;
            var current_post = comments[i].id.slice(locationPrefix == 'news' ? 8 :
                (locationPrefix.length + 9) );
            var refs = comments[i].getElementsByClassName("js-cross-link");
            for(var j=0; j<refs.length; j++) {
                var ref = refs[j].name.slice(locationPrefix.length + 1);
                if(typeof(repliesTable[ref]) != 'undefined')
                    repliesTable[ref].push(current_post);
                else
                    repliesTable[ref] = [current_post];
            }
        }
        for(var post_num in repliesTable) {
            var container = document.createElement("div");
            container.id = "answers_"+post_num;
            container.appendChild(document.createElement('p'));
            container = container.lastChild;
            container.style.margin = '0px';
            container.style.padding = '4px';
            container.style.fontSize = '0.8em';
            container.textContent = "Ответы: ";
            for(var post_ref in repliesTable[post_num]) {
                var link = document.createElement("a");
                link.className = "js-cross-link";
                const urlObj = new URL(document.URL);
                link.href = urlObj.pathname + urlObj.search + '#'+repliesTable[post_num][post_ref];
                link.name = locationPrefix + "/" + repliesTable[post_num][post_ref];
                link.textContent = ">>"+repliesTable[post_num][post_ref];
                link.style.fontSize = '1em';
                container.appendChild(link);
                container.innerHTML += ', ';
            }
            container.innerHTML = container.innerHTML.substring(0, container.innerHTML.length-2);
            var comment = document.getElementById("comment" +
                (locationPrefix == 'news' ? '_' : ('_' + locationPrefix + '_')) + post_num);
            if(comment)
                comment.appendChild(container.parentNode);
      }
      rebindAnswersPreview();
    }

    var commentsRefreshTimer = null;

    function refreshCommentsFeatures() {
        // Порядок важен: скрытие может удалять посты,
        // карта ответов строится по оставшимся
        if(enabledFeatures.indexOf("hiding") != -1)
            hidePosts();
        if(enabledFeatures.indexOf("answermap") != -1)
            createRepliesMap();
        if(enabledFeatures.indexOf("spoilers") != -1)
            revealSpoilers();
        if(enabledFeatures.indexOf("img-spoilers") != -1)
            revealImageSpoilers();
    }

    function registerAutoupdateHandler() {
        if(/\.ca\/news\/add/.test(document.URL))
            return;
        if(document.getElementsByClassName("l-comments-wrap").length === 0)
            return;
        if(!window.MutationObserver)
            return;

        var observer = new MutationObserver(function(mutations) {
            var needRefresh = false;

            for(var i = 0; i < mutations.length; i++) {
                var target = mutations[i].target;

                if(!target || target.nodeType != 1)
                    continue;

                // Реагируем только на изменения внутри блоков комментариев;
                // наши собственные вставки (панели, превью, блоки «Ответы:»)
                // лежат вне .l-comments-wrap либо не содержат .b-comment
                if(!target.closest || !target.closest('.l-comments-wrap'))
                    continue;

                var j, node;

                for(j = 0; j < mutations[i].addedNodes.length; j++) {
                    node = mutations[i].addedNodes[j];
                    if(node.nodeType != 1)
                        continue;
                    if(
                        node.classList.contains('b-comment') ||
                        node.querySelector('.b-comment')
                    ) {
                        // В свежих постах сразу ищем :smile:
                        replaceSmileysInNode(node);
                        needRefresh = true;
                    }
                }

                for(j = 0; j < mutations[i].removedNodes.length; j++) {
                    node = mutations[i].removedNodes[j];
                    if(node.nodeType != 1)
                        continue;
                    if(
                        node.classList.contains('b-comment') ||
                        node.querySelector('.b-comment')
                    ) {
                        needRefresh = true;
                    }
                }
            }

            if(!needRefresh)
                return;

            if(commentsRefreshTimer)
                clearTimeout(commentsRefreshTimer);

            commentsRefreshTimer = setTimeout(function() {
                commentsRefreshTimer = null;
                refreshCommentsFeatures();
            }, 100);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }


   /*
    *      Hiding
    */

    function hidePosts() {
        hidePatterns = [];
        var hiddenComments = [];
        var showedComments = [];
        for(var key in localStorage)
            if(/hidephrase/.test(key))
                hidePatterns.push(new RegExp(localStorage[key],"i"));
            else if(/^comment_/.test(key))
                hiddenComments.push(key);
            else if(/^temp_comment_/.test(key)) {
                var tempHidden = JSON.parse(localStorage.getItem(key));
                for (var i in tempHidden)
                    hiddenComments.push(tempHidden[i]);
            }

        var hideButtons = document.getElementsByClassName('js-remove-button');
        for(var i=0; i < hideButtons.length; i++) {
            var hideButtonImg = hideButtons[i].getElementsByTagName('img')[0];
            if (hideButtonImg)
                ketImg(hideButtonImg, icons['hide']);
            hideButtons[i].onclick = function() {
                hidePost(this.parentNode.parentNode);
                return false;
            }
            hideButtons[i].style.display = "inline-block";
        }

        var comments = document.getElementsByClassName('b-comment');
        for(var i=0; i < comments.length; i++){
            // только настоящие комментарии (id="comment_..."), не превью-клоны
            // и не служебные окна с классом b-comment
            if(!/^comment_/.test(comments[i].id))
                continue;
            for(var j=0; j < hidePatterns.length; j++)
                if(hiddenComments.indexOf(comments[i].id)!= -1 || hidePatterns[j].test(comments[i].textContent)) {
                    hidePost(comments[i]);
                    break;
                }
        }
    }

    function hideThreads() {
        hidePatterns = [];

        for(var key in localStorage) {
            if(/hidephrase/.test(key))
                hidePatterns.push(new RegExp(localStorage[key], "i"));
        }

        var threads = document.getElementsByClassName('b-blog-entry');
        var hideShort = enabledFeatures.indexOf("hide-short-news") != -1;

        for(var i = 0; i < threads.length; i++) {
            var bodyElement = threads[i].getElementsByClassName('b-blog-entry_b-body')[0];
            var headerElement = threads[i].getElementsByClassName('b-blog-entry_b-header')[0];

            if(!bodyElement)
                continue;

            var threadOpPost = bodyElement.textContent || "";
            var threadTitle = headerElement ? headerElement.textContent || "" : "";

            var shouldHide = false;

            // Скрытие по regex
            for(var j = 0; j < hidePatterns.length; j++) {
                if(
                    hidePatterns[j].test(threadOpPost) ||
                    hidePatterns[j].test(threadTitle)
                ) {
                    shouldHide = true;
                    break;
                }
            }

            // Скрытие коротких новостей
            if(hideShort && threadOpPost.length < 140)
                shouldHide = true;

            if(shouldHide)
                hideThread(threads[i]);
        }
    }

    function hideThread(node) {
        if(enabledFeatures.indexOf("show-hidden")!= -1) {
            node.setAttribute("class", "b-blog-entry m-hide");
            var h = node.getElementsByClassName('b-blog-entry_b-header')[0];
            h.onclick = function() {
                showThread(node);
                return false;
            }
        } else {
            node.style.display = "none";
        }
    }

    function showThread(node) {
        node.setAttribute("class", "b-blog-entry");
        var h = node.getElementsByClassName('b-blog-entry_b-header')[0];
        h.onclick = function() {};
    }

    function hidePost(node, parentNode) {
        if (!node)
            return false;
        if(enabledFeatures.indexOf("show-hidden")!= -1) {
            var body = node.getElementsByClassName('b-comment_b-body')[0];
            if (body)
                body.style.display = "none";
            var info = node.getElementsByClassName('b-comment_b-info')[0];
            var button = info ? info.getElementsByClassName('js-remove-button')[0] : null;
            if (button) {
                button.onclick = function() {
                    showPost(node);
                    return false;
                }
                var buttonImg = button.getElementsByTagName('img')[0];
                if (buttonImg)
                    ketImg(buttonImg, icons['show']);
            }
        } else {
            if (node.parentNode)
                node.parentNode.removeChild(node);
        }
        if (enabledFeatures.indexOf("recursive-hidding") != -1) {
            var idPrefix = locationPrefix == 'news' ? 'comment_' : 'comment_' + locationPrefix + '_';
            var replies = repliesTable[node.id.slice(idPrefix.length)];
            for (var i in replies) {
                hidePost(document.getElementById(idPrefix + replies[i]), node);
            }
        }
        if (parentNode) {
            var tempHidden = JSON.parse(localStorage.getItem('temp_' + parentNode.id));
            if (tempHidden) {
                tempHidden.push(node.id);
            } else {
                tempHidden = [node.id];
            }
            localStorage.setItem('temp_' + parentNode.id, JSON.stringify(tempHidden));
        } else {
            localStorage.setItem(node.id, node.id);
        }
        return false;
    }

    function showPost(node) {
        if (!node)
            return false;
        var body = node.getElementsByClassName('b-comment_b-body')[0];
        if (body)
            body.style.display = "block";
        var info = node.getElementsByClassName('b-comment_b-info')[0];
        var button = info ? info.getElementsByClassName('js-remove-button')[0] : null;
        if (button) {
            button.onclick = function() {
                hidePost(node);
                return false;
            }
            var buttonImg = button.getElementsByTagName('img')[0];
            if (buttonImg)
                ketImg(buttonImg, icons['hide']);
        }
        localStorage.removeItem(node.id);
        var tempHidden = JSON.parse(localStorage.getItem('temp_' + node.id));
        if (tempHidden) {
            for (var i in tempHidden) {
                showPost(document.getElementById(tempHidden[i]));
            }
            localStorage.removeItem('temp_' + node.id);
        }
        return false;
    }


   /*
    *      Smiles Panel
    */

   function getSmileyDefinitions() {
        if (smileyDefinitions)
            return smileyDefinitions;

        smileyDefinitions = [];

        var i;

        for(i = 0; i < gifSmileList.length; i++) {
            smileyDefinitions.push({
                text: ':' + gifSmileList[i] + ':',
                url: 'https://1chan.ca/img/' + gifSmileList[i] + '.gif'
            });
        }

        for(i = 0; i < pngSmileList.length; i++) {
            smileyDefinitions.push({
                text: ':' + pngSmileList[i] + ':',
                url: 'https://1chan.ca/img/' + pngSmileList[i] + '.png'
            });
        }

        for(i = 0; i < gifSmileListSVIN.length; i++) {
            smileyDefinitions.push({
                text: ':' + gifSmileListSVIN[i] + ':',
                url:
                    'https://web.archive.org/web/20260819210418im_/https://1chan.win/img/smilies/' +
                    gifSmileListSVIN[i] + '.gif'
            });
        }

        for(i = 0; i < pngSmileListSVIN.length; i++) {
            smileyDefinitions.push({
                text: ':' + pngSmileListSVIN[i] + ':',
                url:
                    'https://web.archive.org/web/20260819210418im_/https://1chan.win/img/smilies/' +
                    pngSmileListSVIN[i] + '.png'
            });
        }

        smileyDefinitions.push({
            text: ':oru2:',
            url:
                'https://web.archive.org/web/20260819210418im_/https://1chan.win/img/smilies/oru.png'
        });

        return smileyDefinitions;
    }


    function getSmileySize(url, callback) {
        if (smileySizeCache.hasOwnProperty(url)) {
            callback(smileySizeCache[url]);
            return;
        }

        if (smileySizePending[url]) {
            smileySizePending[url].push(callback);
            return;
        }

        smileySizePending[url] = [callback];

        var image = new Image();

        image.onload = function() {
            var width = image.naturalWidth || image.width;
            var height = image.naturalHeight || image.height;

            var size = null;

            if (width > 0 && height > 0) {
                size = {
                    width: width,
                    height: height
                };
            }

            smileySizeCache[url] = size;

            var callbacks = smileySizePending[url];
            delete smileySizePending[url];

            for(var i = 0; i < callbacks.length; i++)
                callbacks[i](size);
        };

        image.onerror = function() {
            smileySizeCache[url] = null;

            var callbacks = smileySizePending[url];
            delete smileySizePending[url];

            for(var i = 0; i < callbacks.length; i++)
                callbacks[i](null);
        };

        // src через кэш, и только один раз: повторная установка
        // сгенерировала бы лишний onload после delete smileySizePending
        ketImgResolve(url, function(cachedUrl) {
            image.src = cachedUrl;
        });
    }


    function replaceSmileysInBody(body) {
        if (!body || !body.textContent)
            return;

        if (body.textContent.indexOf(':') == -1)
            return;

        var definitions = getSmileyDefinitions();
        var smileyMap = {};
        var expressions = [];

        for(var i = 0; i < definitions.length; i++) {
            smileyMap[definitions[i].text] = definitions[i];
            expressions.push(
                definitions[i].text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            );
        }

        if (!expressions.length)
            return;

        var regexp = new RegExp('(?:' + expressions.join('|') + ')', 'g');

        var walker = document.createTreeWalker(
            body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        var textNodes = [];
        var node;

        while(node = walker.nextNode()) {
            if (
                node.parentNode &&
                !/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/i.test(
                    node.parentNode.nodeName
                )
            ) {
                regexp.lastIndex = 0;

                if (regexp.test(node.nodeValue))
                    textNodes.push(node);
            }
        }

        for(var n = 0; n < textNodes.length; n++) {
            var textNode = textNodes[n];
            var text = textNode.nodeValue;

            regexp.lastIndex = 0;

            var fragment = document.createDocumentFragment();
            var lastIndex = 0;
            var match;

            while((match = regexp.exec(text)) !== null) {
                if (match.index > lastIndex) {
                    fragment.appendChild(
                        document.createTextNode(
                            text.substring(lastIndex, match.index)
                        )
                    );
                }

                var smile = smileyMap[match[0]];

                var img = document.createElement('img');

                img.className = 'smiley';
                ketImg(img, smile.url);
                img.alt = '';

                getSmileySize(smile.url, (function(img) {
                    return function(size) {
                        if (!size)
                            return;

                        img.setAttribute('width', size.width);
                        img.setAttribute('height', size.height);
                    };
                })(img));

                fragment.appendChild(img);

                lastIndex = match.index + match[0].length;
            }

            if (lastIndex < text.length) {
                fragment.appendChild(
                    document.createTextNode(
                        text.substring(lastIndex)
                    )
                );
            }

            textNode.parentNode.replaceChild(fragment, textNode);
        }
    }


    function replaceSmileysInNode(node) {
        if (!node || node.nodeType != 1)
            return;

        if (
            node.classList.contains('b-blog-entry_b-body') ||
            node.classList.contains('b-comment_b-body')
        ) {
            replaceSmileysInBody(node);
        }

        var bodies = node.querySelectorAll(
            '.b-blog-entry_b-body, .b-comment_b-body'
        );

        for(var i = 0; i < bodies.length; i++)
            replaceSmileysInBody(bodies[i]);
    }


    function initSmileyRendering() {
        replaceSmileysInNode(document.body);

        if (!window.MutationObserver)
            return;

        var observer = new MutationObserver(function(mutations) {
            for(var i = 0; i < mutations.length; i++) {
                var addedNodes = mutations[i].addedNodes;

                for(var j = 0; j < addedNodes.length; j++) {
                    if (addedNodes[j].nodeType == 1)
                        replaceSmileysInNode(addedNodes[j]);
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

   /*
    *      Последнее активное поле ввода: на страницах вроде
    *      /news/add полей несколько (text и text_full) — вставка
    *      идёт в то, с которым юзер взаимодействовал последним
    */

    var ketActiveTextarea = null;

    function ketTrackTextarea(target) {
        if (
            target &&
            target.tagName == 'TEXTAREA' &&
            (
                target.id == 'comment_form_text' ||
                target.name == 'text' ||
                target.name == 'text_full'
            )
        )
            ketActiveTextarea = target;
    }

    function getTargetTextarea(preferred) {
        if (ketActiveTextarea && document.contains(ketActiveTextarea))
            return ketActiveTextarea;
        if (preferred && document.contains(preferred))
            return preferred;
        if (formTextarea && document.contains(formTextarea))
            return formTextarea;
        return document.getElementById('comment_form_text')
            || document.getElementsByName('text')[0]
            || document.getElementsByName('text_full')[0]
            || null;
    }

    function addTextToForm(text, textarea) {
        var ta = getTargetTextarea(textarea);
        if (!ta)
            return;
        var cursor_pos = ta.selectionStart;
        var formText = ta.value;
        ta.value = formText.slice(0, cursor_pos)
                            + text
                            + formText.slice(ta.selectionEnd);
        focusNoScroll(ta);
    };

    function wrapImageLink(link) {
        if (!link)
            return "";
        if (/imgur/.test(link)) {
            var e = /imgur.com\/([^\]\[]+)/.exec(link);
			var d = e[1].replace('.jpg', '');
			var c = d.replace('.webm', '');
			var b = c.replace('.png', '');
			var a = b.replace('.gif', '');
            if (a) {
                return '[i:' + a + ':]';
            }
        } else {
            return '[' + link + ']';
        }
    }

    function createSmile(text, imgLink, textarea) {

        var image = document.createElement("img");
        var link = document.createElement("a");

        link.href = "#";
        link.onclick = function(e) {
            // preventDefault ДО любой логики: если что-то упадёт,
            // браузер не уйдёт по href="#" и не подбросит страницу вверх
            if (e && e.preventDefault)
                e.preventDefault();
            if (deletingSmiles) {
                var key = this.getAttribute('data-ket-key');
                if (key)
                    destroyCustomSmile(key);
            } else {
                addTextToForm(text, textarea);
            }
            return false;
        };
        link.title = text;
        ketImg(image, imgLink);
        image.style.margin = "6px 3px 1px 3px";
        link.style.outline  = "none";
        link.appendChild(image);
        return link;
    }

    // Custom Images

    function createCustomImage(link) {

        var name = prompt("Имя для картинки:");
        if (!name)
            return false;
        var id = "image-" + name;

        if (localStorage.getItem(id)) {
            alert("Уже есть картинка с таким именем");
            return false;
        }
        localStorage.setItem(id, link);
        addCustomImage(link, name);
    }

    function addCustomImage(link, name, panel) {

        var id = "image-" + name;
        var panels = panel
            ? [panel]
            : document.querySelectorAll('.ket-smile-panel');

        for(var p = 0; p < panels.length; p++) {
            var newImage = createButton(name, (function(ta) {
                return function(e) {
                    if (e && e.preventDefault)
                        e.preventDefault();
                    if (deletingSmiles) {
                        var key = this.getAttribute('data-ket-key');
                        if (key)
                            destroyCustomImage(key);
                    } else {
                        addTextToForm('"'+wrapImageLink(link)+'":'+link, ta);
                    }
                    return false;
                };
            })(panels[p]._ketTextarea));

            newImage.setAttribute('data-ket-key', id);
            newImage.onmousedown = function(e) {
                if (e.which === 2) {
                    destroyCustomImage(this.getAttribute('data-ket-key'));
                }
                return false;
            };

            newImage.setAttribute("class", "add-image-button");

            var imageContainer = panels[p].querySelector('.ket-image-container');
            if (imageContainer) {
                imageContainer.appendChild(newImage);
                imageContainer.style.display = "block";
            }
        }
    }

    function destroyCustomImage(id) {
        if (!id)
            return;
        localStorage.removeItem(id);

        var buttons = document.querySelectorAll('.add-image-button');
        for(var i = buttons.length - 1; i >= 0; i--) {
            if (buttons[i].getAttribute('data-ket-key') == id) {
                var container = buttons[i].parentNode;
                container.removeChild(buttons[i]);
                if (container.getElementsByClassName('add-image-button').length === 0)
                    container.style.display = "none";
            }
        }
    }

    // Custom Smiles

    function createCustomSmile(link) {

        var id  = "smile-"+link;

        if (localStorage.getItem(id)) {
            alert("Такой смайлик уже добавлен");
            return false;
        }
        localStorage.setItem(id, link);
        addCustomSmile(link);
    }

    function addCustomSmile(link, panel) {

        var id  = "smile-"+link;
        var wrappedLink = wrapImageLink(link);
        if (!wrappedLink)
            return;

        var panels = panel
            ? [panel]
            : document.querySelectorAll('.ket-smile-panel');

        for(var p = 0; p < panels.length; p++) {
            var newSmile = createSmile('"' + wrappedLink + '":' + link, link, panels[p]._ketTextarea);

            newSmile.setAttribute('data-ket-key', id);
            newSmile.onmousedown = function(e) {
                if (e.which === 2) {
                    destroyCustomSmile(this.getAttribute('data-ket-key'));
                }
                return false;
            };
            newSmile.title = "Средняя кнопка мыши для удаления";
            newSmile.setAttribute("class", "add-smile-link");

            var imageContainer = panels[p].querySelector('.ket-image-container');
            panels[p].insertBefore(newSmile, imageContainer);
        }
    }

    function destroyCustomSmile(id) {
        if (!id)
            return;
        localStorage.removeItem(id);

        var links = document.querySelectorAll('.add-smile-link');
        for(var i = links.length - 1; i >= 0; i--) {
            if (links[i].getAttribute('data-ket-key') == id)
                links[i].parentNode.removeChild(links[i]);
        }
    }

    function addSmileClick(e, textarea) {

        if (e && e.preventDefault)
            e.preventDefault();

        var ta = getTargetTextarea(textarea);
        var link = ta ? getSelectionText(ta) : '';

        if (link.length > 0) {} else {
            link = prompt('Полная ссылка на изображение на имгуре:');
        }

        if (!link)
            return false;

        var image = new Image();
        var num = "";

        if (/imgur/.test(link)) {
            var e = /imgur.com\/([^\]\[]+)/.exec(link);
			var d = e[1].replace('.jpg', '');
			var c = d.replace('.webm', '');
			var b = c.replace('.png', '');
			var a = b.replace('.gif', '');
            if (a) {
                num = a;
            } else {
                return false;
            }
        } else {
            return false;
        }

        link = "https://i.imgur.com/" + num + ".jpg";
        image.src = link;
        image.onerror = function() {
            if(num) {
                image.src = link;
            }
            image.onerror = function() {
                alert("Ошибка при загрузке картинки");
            }
        }
        image.onload = function() {
            if (image.width > 45 || image.heigth > 45) {
                createCustomImage(link);
            } else {
                createCustomSmile(link);
            }
        }
        return false;
    }

    function removeSmilesClick(e) {
        if (e && e.preventDefault)
            e.preventDefault();

        deletingSmiles = !deletingSmiles;

        var modeIcons = document.querySelectorAll('.ket-remove-smiles-icon');
        for(var i = 0; i < modeIcons.length; i++)
            ketImg(modeIcons[i], deletingSmiles ? icons['whiteCross'] : icons['redCross']);

        return false;
    }

   /*
    *      Режим панели: все смайлики / только какаческие.
    *      Влияет ТОЛЬКО на панель: замена :smile: в текстах
    *      постов работает по полному списку в любом режиме.
    */

    function smilesModeTitle() {
        return smilesMode == 'smilesKakachOnly'
            ? 'Смайлики только из Какача'
            : 'Все смайлики';
    }

    function toggleSmilesMode(e) {
        if (e && e.preventDefault)
            e.preventDefault();

        smilesMode = (smilesMode == 'smilesKakachOnly') ? 'smilesAll' : 'smilesKakachOnly';
        localStorage.setItem('smiles-mode', smilesMode);

        var stocks = document.querySelectorAll('.ket-stock-smiles');
        for(var i = 0; i < stocks.length; i++) {
            var panel = stocks[i].parentNode;
            while(stocks[i].firstChild)
                stocks[i].removeChild(stocks[i].firstChild);
            stocks[i].appendChild(
                createStockSmiles(panel ? panel._ketTextarea : null)
            );
        }

        var modeIcons = document.querySelectorAll('.ket-smiles-mode-icon');
        for(var i = 0; i < modeIcons.length; i++) {
            ketImg(modeIcons[i], icons[smilesMode]);
            if (modeIcons[i].parentNode)
                modeIcons[i].parentNode.title = smilesModeTitle();
        }

        return false;
    }

    function createStockSmiles(textarea) {
        var fragment = document.createDocumentFragment();

        for(var i in gifSmileList)
            fragment.appendChild(createSmile(':'+gifSmileList[i]+':', "https://1chan.ca/img/" + gifSmileList[i] + ".gif", textarea));
        for(var i in pngSmileList)
            fragment.appendChild(createSmile(':'+pngSmileList[i]+':', "https://1chan.ca/img/" + pngSmileList[i] + ".png", textarea));

        if (smilesMode != 'smilesKakachOnly') {
            for(var i in gifSmileListSVIN)
                fragment.appendChild(createSmile(':'+gifSmileListSVIN[i]+':', "https://web.archive.org/web/20260819210418im_/https://1chan.win/img/smilies/" + gifSmileListSVIN[i] + ".gif", textarea));
            for(var i in pngSmileListSVIN)
                fragment.appendChild(createSmile(':'+pngSmileListSVIN[i]+':', "https://web.archive.org/web/20260819210418im_/https://1chan.win/img/smilies/" + pngSmileListSVIN[i] + ".png", textarea));
            fragment.appendChild(createSmile(':oru2:', "https://web.archive.org/web/20260819210418im_/https://1chan.win/img/smilies/oru.png", textarea));
        }

        return fragment;
    }


    function createSmilePanel(textarea) {

        textarea = textarea || formTextarea;
        if (!textarea)
            return;

        var container = document.createElement("div");
        var imageContainer = document.createElement("div");

        container.className = 'ket-smile-panel';
        container._ketTextarea = textarea;

        var stockContainer = document.createElement("span");
        stockContainer.className = 'ket-stock-smiles';
        stockContainer.appendChild(createStockSmiles(textarea));
        container.appendChild(stockContainer);

        var addSmileLink  = document.createElement("a");
        var addSmileImg = document.createElement("img");
        ketImg(addSmileImg, icons['addSmile']);
        addSmileLink.href = "#";
        addSmileLink.onclick = function(e) {
            addSmileClick(e, textarea);
            return false;
        };
        addSmileLink.appendChild(addSmileImg);
        addSmileLink.title = "Добавить смайлик или картинку";

        var removeSmilesLink  = document.createElement("a");
        var removeSmilesImg = document.createElement("img");
        ketImg(removeSmilesImg, deletingSmiles ? icons['whiteCross'] : icons['redCross']);
        removeSmilesImg.className = "ket-remove-smiles-icon";
        removeSmilesLink.href = "#";
        removeSmilesLink.onclick = removeSmilesClick;
        removeSmilesLink.appendChild(removeSmilesImg);
        removeSmilesLink.title = "Удалить смайлики или картинки";

        var smilesModeLink  = document.createElement("a");
        var smilesModeImg = document.createElement("img");
        ketImg(smilesModeImg, icons[smilesMode]);
        smilesModeImg.className = "ket-smiles-mode-icon";
        smilesModeLink.href = "#";
        smilesModeLink.onclick = toggleSmilesMode;
        smilesModeLink.appendChild(smilesModeImg);
        smilesModeLink.title = smilesModeTitle();

        var controlsContainer = document.createElement("span");
        controlsContainer.style.cssFloat = "right";
        controlsContainer.style.margin = "5px";

        controlsContainer.appendChild(smilesModeLink);
        controlsContainer.appendChild(document.createElement("br"));
        controlsContainer.appendChild(addSmileLink);
        controlsContainer.appendChild(document.createElement("br"));
        controlsContainer.appendChild(removeSmilesLink);

        container.appendChild(controlsContainer);
        container.style.minHeight = "50px";

        if(/\.ca\/news\/add/.test(document.URL)) { // news/add
            container.style.width = '534px'
            container.style.border = "1px solid #999999";
            container.style.margin = "0 0 10px 0";
            document.getElementsByName('text_full')[0].parentNode.insertBefore(container,
                                                        document.getElementsByName('text_full')[0]);
        }
        else {
            container.style.margin = "10px";
            container.style.paddingLeft = "8px";
            container.style.border = "1px solid #CCCCCC";
            container.style.borderRadius = "5px";
            var formBody = textarea.parentNode.parentNode;
            formBody.parentNode.insertBefore(container, formBody);
        }

        imageContainer.className = "ket-image-container";
        imageContainer.style.margin = "5px 6px 7px 0px";
        imageContainer.style.paddingTop = "2px";
        imageContainer.style.borderTop = "1px dashed #CCCCCC";
        imageContainer.style.display = "none";

        container.appendChild(imageContainer);

        var images = [];
        for(var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if ((/^smile-/).test(key)) {
                addCustomSmile(localStorage.getItem(key), container);
            } else if ((/^image-.+$/).test(key))
                images.push(key);
        }

        for(var i in images) {
            var name = /^image-(.+)$/.exec(images[i])[1];
            addCustomImage(localStorage.getItem(images[i]), name, container);
        }

        if(enabledFeatures.indexOf("panel-hiding")!= -1)
            initSmilePanelHiding(container)
    }

    function initSmilePanelHiding(smilePanel) {

        var showButton = document.createElement("a");
        var showContainer = document.createElement("div");
        var hideButton = document.createElement("a");
        var hideContainer = document.createElement("div");

        showButton.onclick = function() {
            showSmilePanels();
            return false;
        };
        showButton.textContent = "Cмайлики и картинки";
        showButton.style.borderBottom = "1px dashed #3366CC";
        showButton.style.textDecoration = "none";
        showButton.href = "#";
        showContainer.appendChild(showButton);
        showContainer.style.display = "none";
        showContainer.style.fontSize = "0.65em";
        showContainer.className = "ket-show-panel-button";

        hideButton.onclick = function() {
            hideSmilePanels();
            return false;
        };
        hideButton.textContent = "Спрятать панель";
        hideButton.style.borderBottom = "1px dashed #3366CC";
        hideButton.style.textDecoration = "none";
        hideButton.href = "#";
        hideContainer.appendChild(hideButton);
        hideContainer.style.fontSize = "0.65em";
        hideContainer.className = "ket-hide-panel-button";

        if(/\.ca\/news\/add/.test(document.URL)) {
            hideContainer.style.margin = "3px 0px 4px 220px";
            showContainer.style.margin = "3px 0px 4px 210px";
        } else {
            hideContainer.style.margin = "3px 0px -3px 240px";
            showContainer.style.margin = "3px 0px -3px 230px";
        }

        smilePanel.parentNode.insertBefore(hideContainer, smilePanel);
        smilePanel.parentNode.insertBefore(showContainer, smilePanel);

        if(localStorage.getItem("smile_panel") == "hidden")
            hideSmilePanels();
    }

    function setSmilePanelsVisible(visible) {
        var panels = document.querySelectorAll('.ket-smile-panel');
        for(var i = 0; i < panels.length; i++)
            panels[i].style.display = visible ? "block" : "none";

        var showButtons = document.querySelectorAll('.ket-show-panel-button');
        for(var i = 0; i < showButtons.length; i++)
            showButtons[i].style.display = visible ? "none" : "block";

        var hideButtons = document.querySelectorAll('.ket-hide-panel-button');
        for(var i = 0; i < hideButtons.length; i++)
            hideButtons[i].style.display = visible ? "block" : "none";
    }

    function hideSmilePanels() {
        localStorage.setItem("smile_panel", "hidden");
        setSmilePanelsVisible(false);
    }

    function showSmilePanels() {
        localStorage.setItem("smile_panel", "visible");
        setSmilePanelsVisible(true);
    }


   /*
    *      Markup Panel
    */

    function getSelectionText(node) {
        var start = node.selectionStart;
        var end = node.selectionEnd;
        return node.value.substring(start, end);
    }

    function wrapText(text, wrapper) {
        return wrapper + text + wrapper;
    }

    function createButton(value, onclick) {
        var button   = document.createElement("input");
        button.type  = "button";
        button.value = value;
        button.onclick = onclick;
        return button;
    }

    function imgClick(textarea) {
        var ta = getTargetTextarea(textarea);
        if (!ta)
            return;
        var link = getSelectionText(ta);

        if (link.length > 0) {
            addTextToForm(wrapImageLink(link), ta);
        } else {
            addTextToForm(wrapImageLink(prompt('Полная ссылка на изображение на имгуре:')), ta);
        }
    }

    function quoteClick(textarea) {

        var ta = getTargetTextarea(textarea);
        if (!ta)
            return;
        var text  = getSelectionText(ta);
        var start = ta.selectionStart;

        if (text.length > 0) {
            var formText = ta.value;
            var lines = text.split("\n");
            for(var i in lines) {
                lines[i] = ">>" + lines[i].trim() + "<<";
            }
            addTextToForm(lines.join("\n"), ta);
            if(lines.length == 1)
                ta.setSelectionRange(start + 2, start + text.length + 2);
        } else {
            text = document.getSelection().toString();
            var lines = text.split("\n");
            for(var i in lines) {
              lines[i] = ">" + lines[i].trim();
            }
            addTextToForm(lines.join("\n"), ta);
        }
    }

    function bigBoldClick(textarea) {

        var ta = getTargetTextarea(textarea);
        if (!ta)
            return;
        var text = getSelectionText(ta);
        var lines = text.split("\n");
        var cursor = ta.selectionEnd;
        var start = ta.selectionStart;
        const stars = "\n********************************************";

        if (text.length > 0) {
            for(var i in lines) {
                if (lines[i] !== "")
                    lines[i] += stars;
            }
            addTextToForm(lines.join("\n"), ta);
        } else {
            ta.value += stars;
        }

        focusNoScroll(ta);
        if(lines.length == 1 && text.length > 0)
            ta.setSelectionRange(start, start + text.length);
        else
            ta.setSelectionRange(cursor, cursor);
    }

    function strikeThroughClick(textarea) {
        var ta = getTargetTextarea(textarea);
        if (!ta)
            return;
        var text = getSelectionText(ta);
        addTextToForm('<s>' + text + '</s>', ta);
    }

    function yobaClick(textarea) {
        var ta = getTargetTextarea(textarea);
        if (!ta)
            return;
        var selected_text = getSelectionText(ta);
        var has_selected = selected_text.length != 0;

        if(has_selected)
           addTextToForm(yobaTranslate(selected_text), ta);
        else
           ta.value = yobaTranslate(ta.value)
    }

    function createMarkupPanel(textarea) {

        textarea = textarea || formTextarea;
        if (!textarea)
            return;

        var container = document.createElement("div");
        var markup = {
            "B": ["**", "Жирный"],
            "I": ["*", "Наклонный"],
            "C": ["`", "Моноширный"],
            "%": ["%%", "Спойлер"]
        };

        var buttons = {
            "img": imgClick,
            ">": quoteClick,
            "S": strikeThroughClick,
            "BB": bigBoldClick,
            "Y": yobaClick
        };
            var voxButton = createButton("vox", function() {
                var ta = getTargetTextarea(textarea);
                if (!ta)
                    return;
                var text = getSelectionText(ta);
                var start = ta.selectionStart;
                var selection = ta.selectionStart != ta.selectionEnd;
                text = "#%" + text + "%#";
                addTextToForm(text, ta);
                if(selection)
                    ta.setSelectionRange(start, start + text.length);
                else
                    ta.setSelectionRange(start + 2, start + 2);
                });
            container.appendChild(voxButton);

        for (var k in buttons)
            container.appendChild(createButton(k, (function(fn, ta) {
                return function() { fn(ta); };
            })(buttons[k], textarea)));

        for(var k in markup) {
            var newButton = createButton(k, function() {
                var ta = getTargetTextarea(textarea);
                if (!ta)
                    return;
                var text = getSelectionText(ta);
                var start = ta.selectionStart;
                var selection = ta.selectionStart != ta.selectionEnd;
                var m = markup[this.value][0];
                text = wrapText(text, m);
                addTextToForm(text, ta);
                if(selection)
                    ta.setSelectionRange(start, start + text.length);
                else
                    ta.setSelectionRange(start + m.length, start + m.length);
                });
            container.appendChild(newButton);
        }

        if(/\.ca\/news\/add/.test(document.URL)) {
            container.style.paddingTop = "4px";
            document.getElementsByName('text_full')[0].parentNode.insertBefore(container,
                                                        document.getElementsByName('text_full')[0])
            // смену полей text/text_full теперь покрывает общий
            // трекер ketTrackTextarea (см. letTheSobakOut)
        } else {
            // .b-comment-form_b-uplink есть не везде (в форме быстрого
            // ответа его нет) — ищем рядом с нашей формой, иначе
            // просто ставим панель над полем ввода
            var uplink = textarea.parentNode.getElementsByClassName("b-comment-form_b-uplink")[0];
            if(enabledFeatures.indexOf("markup-top") == -1 && uplink) {
                container.style.display = "inline-block";
                textarea.parentNode.insertBefore(container, uplink);
            } else {
                container.style.marginTop = "3px";
                textarea.style.margin = "3px 0px 6px"
                textarea.parentNode.insertBefore(container, textarea);
            }
        }
    }


   /*
    *      Spoilers
    */

    function revealSpoilers() {
        var spoilers = document.getElementsByClassName('b-spoiler-text')
        for(var i = 0; i<spoilers.length; i++)
            spoilers[i].setAttribute('style', 'color:#40454B !important')
    }

    function revealImageSpoilers() {
        var images = document.getElementsByTagName('img');
        for (var i = 0; i < images.length; i++) {
            if (images[i].classList.contains('spoiler-media'))
                images[i].style.display = 'block';
        }

        var spoilers = document.getElementsByClassName('eye-icon');
        for (var i = 0; i < spoilers.length; i++)
            spoilers[i].style.display = 'none';
    }

   /*
    * Yoba Translator
    */
   var yoba_main = {
      'а': ["a"],
      'б': ["b"],
      'в': ["v"],
      'г': ["g"],
      'д': ["d"],
      'е': ["ye", "e"],
      'ё': ["yo"],
      'ж': ["zh"],
      'з': ["z"],
      'и': ["i", "ee"],
      'й': ["y", "j"],
      'к': ["k", "ck", "q"],
      'л': ["l"],
      'м': ["m"],
      'н': ["n"],
      'о': ["o", "ou"],
      'п': ["p"],
      'р': ["r"],
      'с': ["s"],
      'т': ["t"],
      'у': ["oo", "u"],
      'ф': ["f"],
      'х': ["kh"],
      'ц': ["c"],
      'ч': ["ch"],
      'ш': ["sh"],
      'щ': ["sh"],
      'ы': ["y", "i"],
      'э': ["e"],
      'ю': ["yu"],
      'я': ["ya"],
   };

   var yoba_ends = {
      'и': ["ey"],
      'е': ["eu"],
      'о': ["ou"],
   };

   function pickRandomElement(arr) {
      if(arr.length == 0)
         return null;
      else if(arr.length == 1)
         return arr[0];
      else
         return arr[Math.floor(Math.random() * arr.length)];
   }

   function yobaTranslate(str) {
      var result = "";

      str = str.replace(/[ьъ]/gi, "");

      for(var pos = 0; pos < str.length; pos++)
      {
         var from = str[pos];
         var to   = '';

         var is_upper = from == from.toUpperCase();
         from = from.toLowerCase();

         if(yoba_ends[from] && (!str[pos + 1] || /[\s\.,!\?]/.test(str[pos + 1])))
            to = pickRandomElement(yoba_ends[from]);
         else if(yoba_main[from])
            to = pickRandomElement(yoba_main[from]);
         else
            to = from;

         if(is_upper)
            to = to[0].toUpperCase() + to.slice(1);

         result += to;
      }

      return result;
   }

   /*
    *      Menu
    */

    function setMenuButtonAction(className, handler) {
        var buttons = document.getElementsByClassName(className);

        for(var i = 0; i < buttons.length; i++)
            buttons[i].onclick = handler;
    }


    function createFormSettingsMenu(textarea) {
        textarea = textarea || formTextarea;
        if (!textarea)
            return;

        if (!textarea.parentNode || !textarea.parentNode.parentNode)
            return;

        var container =
            textarea.parentNode.parentNode.getElementsByTagName("div")[0];

        if (!container)
            return;

        var general = document.createElement("a");

        general.href = "#";
        general.className = "general-settings-button";

        var generalIcon = document.createElement("img");
        ketImg(generalIcon, icons['settings']);

        general.appendChild(generalIcon);

        var hidelist = document.createElement("a");

        hidelist.href = "#";
        hidelist.className = "hiding-list-button";

        var regexpIcon = document.createElement("img");
        ketImg(regexpIcon, icons['regexp']);

        hidelist.appendChild(regexpIcon);

        general.style.cssFloat = "right";
        hidelist.style.cssFloat = "right";

        general.style.margin = "0px 10px 0px 2px";

        general.title = "Настройки скрипта";
        hidelist.title = "Список скрываемых выражений";

        container.parentNode.insertBefore(general, container);
        container.parentNode.insertBefore(hidelist, container);
    }


    function createSidebarSettingsMenu() {
        var container =
            document.getElementsByClassName("l-left-panel-wrap")[0];

        if (!container)
            return;

        var generalX =
            '<div class="b-menu-panel">' +
                '<div class="b-menu-panel_b-title">' +
                    '<h2>1chan Extension Tools</h2>' +
                '</div>' +
                '<div class="b-menu-panel_b-links">' +
                    '<ul>' +
                        '<li class="m-active">' +
                            '<a href="#" class="general-settings-button" id="general-settings-button">' +
                                'Настройки скрипта' +
                            '</a>' +
                        '</li>' +
                        '<li class="m-active">' +
                            '<a href="#" class="hiding-list-button" id="hiding-list-button">' +
                                'Список скрываемых выражений' +
                            '</a>' +
                        '</li>' +
                    '</ul>' +
                '</div>' +
            '</div>';

        container.insertAdjacentHTML('afterbegin', generalX);
    }


    function createMenu() {
        if (settingsPosition == 'form' || settingsPosition == 'both')
            createFormSettingsMenu();

        if (settingsPosition == 'sidebar' || settingsPosition == 'both')
            createSidebarSettingsMenu();

        setMenuButtonAction(
            'general-settings-button',
            displayGeneralOptions
        );

        setMenuButtonAction(
            'hiding-list-button',
            displayHideList
        );
    }

    function hideGeneralOptions() {
        var layout =
            document.getElementById(
                'scriptsettings-layout'
            );

        if (layout)
            layout.parentNode.removeChild(layout);

        setMenuButtonAction(
            'general-settings-button',
            displayGeneralOptions
        );

        return false;
    }

    function displayGeneralOptions() {
        var layout = document.createElement("div");
        var container = document.createElement("div");
        var buttonsContainer = document.createElement("div");

        setMenuButtonAction(
            'general-settings-button',
            hideGeneralOptions
        );

        layout.id = 'scriptsettings-layout';

        layout.style.position = 'fixed';
        layout.style.top = '5px';
        layout.style.left = '5px';
        layout.style.zIndex = '10000';

        layout.style.display = 'flex';
        layout.style.alignItems = 'flex-end';
        layout.style.gap = '5px';

        container.id = 'scriptsettings';

        container.setAttribute(
            "style",
            'height:fit-content; width:fit-content; position: relative !important;box-sizing: border-box;padding:5px;margin:0;font-size: 1em;'
        );

        container.setAttribute(
            "class",
            "b-comment"
        );

        for(var i = 0; i < features.length; i++) {
            var desc = document.createElement('p');

            desc.textContent = descriptions[i];
            desc.style.display = 'inline';
            desc.style.fontSize = '0.75em';

            var box = document.createElement('input');

            box.type = 'checkbox';
            box.className = 'opt';
            box.id = features[i];

            container.appendChild(box);
            container.appendChild(desc);
            container.appendChild(
                document.createElement('br')
            );
        }

        var positionDesc = document.createElement('p');

        positionDesc.textContent =
            'Положение настроек';

        positionDesc.style.display = 'inline-block';
        positionDesc.style.fontSize = '0.75em';
        positionDesc.style.margin = "0 0 10px 5px";

        var positionSelect = document.createElement('select');

        positionSelect.id = 'settings-position';

        var positionOptions = [
            ['sidebar', 'сайдбар'],
            ['form', 'форма'],
            ['both', 'сайдбар и форма']
        ];

        for(var p = 0; p < positionOptions.length; p++) {
            var option = document.createElement('option');

            option.value = positionOptions[p][0];
            option.textContent = positionOptions[p][1];

            positionSelect.appendChild(option);
        }

        positionSelect.value =
            settingsPosition;

        container.appendChild(positionSelect);
        container.appendChild(positionDesc);
        container.appendChild(
            document.createElement('br')
        );

        var saveButton =
            document.createElement("button");

        saveButton.textContent = "Сохранить";
        saveButton.onclick = saveGeneralOptions;

        container.appendChild(saveButton);

        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.alignItems = 'flex-end';

        var closeButton =
            document.createElement("button");

        closeButton.id =
            "scriptsettings-close";

        closeButton.textContent = "X";

        closeButton.onclick =
            hideGeneralOptions;

        buttonsContainer.appendChild(closeButton);

        layout.appendChild(container);
        layout.appendChild(buttonsContainer);

        document.body.appendChild(layout);

        for(var i = 0; i < enabledFeatures.length; i++) {
            if (
                enabledFeatures[i] != '' &&
                document.getElementById(enabledFeatures[i])
            ) {
                document.getElementById(
                    enabledFeatures[i]
                ).checked = true;
            }
        }

        return false;
    }

    function saveGeneralOptions() {
        enabledFeatures = [];

        var boxes =
            document.getElementsByClassName('opt');

        for(var i = 0; i < boxes.length; i++) {
            if (boxes[i].checked)
                enabledFeatures.push(boxes[i].id);
        }

        var str = '';

        for(var i = 0; i < enabledFeatures.length; i++)
            str += enabledFeatures[i] + ' ';

        localStorage[
            'settings' + VERSION
        ] = str;

        settingsPosition =
            document.getElementById(
                'settings-position'
            ).value;

        localStorage[
            'settings-position' + VERSION
        ] = settingsPosition;

        location.reload();
    }

    function hideHideList() {
        var layout =
            document.getElementById(
                'hiding-list-layout'
            );

        if (layout)
            layout.parentNode.removeChild(layout);

        setMenuButtonAction(
            'hiding-list-button',
            displayHideList
        );

        return false;
    }


    function displayHideList() {
        var layout = document.createElement("div");
        var container = document.createElement("div");
        var buttonsContainer = document.createElement("div");

        setMenuButtonAction(
            'hiding-list-button',
            hideHideList
        );

        layout.id = 'hiding-list-layout';

        layout.style.position = 'fixed';
        layout.style.top = '5px';
        layout.style.left = '5px';
        layout.style.zIndex = '10000';

        layout.style.display = 'flex';
        layout.style.alignItems = 'flex-end';
        layout.style.gap = '5px';

        container.id = 'hiding-list';

        container.setAttribute(
            "style",
            'height:fit-content; width:fit-content; position: relative !important; box-sizing: border-box; padding:5px; margin:0; font-size:1em;'
        );

        container.setAttribute(
            "class",
            "b-comment"
        );

        var list = document.createElement("textarea");

        list.id = "regexps";

        list.setAttribute(
            "style",
            "width:300px; height:300px; margin:0"
        );

        for(var key in localStorage) {
            if(/hidephrase/.test(key))
                list.value += localStorage[key] + '\n';
        }

        container.appendChild(list);

        var saveButton =
            document.createElement("button");

        saveButton.textContent = "Сохранить";
        saveButton.onclick = updateRegexps;
        saveButton.style.marginTop = "5px";

        container.appendChild(
            document.createElement("br")
        );

        container.appendChild(saveButton);

        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.alignItems = 'flex-end';

        var closeButton =
            document.createElement("button");

        closeButton.id =
            "hiding-list-close";

        closeButton.textContent = "X";

        closeButton.onclick =
            hideHideList;

        buttonsContainer.appendChild(closeButton);

        layout.appendChild(container);
        layout.appendChild(buttonsContainer);

        document.body.appendChild(layout);

        return false;
    }


    function updateRegexps() {
        for(var key in localStorage) {
            if(/hidephrase/.test(key))
                localStorage.removeItem(key);
        }

        var regexps =
            document.getElementById('regexps').value.split('\n');

        for(var i = 0; i < regexps.length; i++) {
            if(regexps[i] != "") {
                localStorage.setItem(
                    "hidephrase" + i,
                    regexps[i]
                );
            }
        }

        location.reload();
    }


   /*
    *      Быстрый ответ: движок создаёт #comment_form динамически
    *      из template_form_comment — навешиваем на неё панели
    *      расширения, как на обычную форму
    */

    function attachToCommentForm() {
        var form = document.getElementById('comment_form');

        if (!form || form.getAttribute('data-ket-attached'))
            return;

        var textarea = form.querySelector('#comment_form_text');

        if (!textarea)
            return;

        form.setAttribute('data-ket-attached', '1');

        // Свежая форма становится целью по умолчанию
        formTextarea = textarea;

        if (enabledFeatures.indexOf("markup") != -1)
            createMarkupPanel(textarea);

        if (enabledFeatures.indexOf("smiles") != -1)
            createSmilePanel(textarea);

        if (settingsPosition == 'form' || settingsPosition == 'both') {
            createFormSettingsMenu(textarea);

            setMenuButtonAction(
                'general-settings-button',
                displayGeneralOptions
            );

            setMenuButtonAction(
                'hiding-list-button',
                displayHideList
            );
        }
    }

    function registerQuickReplyWatcher() {
        if (!window.MutationObserver)
            return;

        var observer = new MutationObserver(function(mutations) {
            for(var i = 0; i < mutations.length; i++) {
                var addedNodes = mutations[i].addedNodes;

                for(var j = 0; j < addedNodes.length; j++) {
                    var node = addedNodes[j];

                    if (node.nodeType != 1)
                        continue;

                    if (
                        node.id == 'comment_form' ||
                        (node.querySelector && node.querySelector('#comment_form'))
                    ) {
                        attachToCommentForm();
                        return;
                    }
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }









   /******************************************************************
    *                                                                *
    *                    M O B I L E   V I E W                       *
    *                                                                *
    *      Порт мобильного функционала с менее кривого колчка:       *
    *      выдвижные боковые панели с тогглами в топ-панели          *
    *      (брейкпоинт 1060px вместо 670px) и мобильная кака         *
    *      (945px). Стили инжектятся одним <style>, цвета            *
    *      зависят от темы страницы.                                 *
    *                                                                *
    ******************************************************************/





   /*
    *      Определение темы по виджету каки: у крайнего
    *      родительского div'а (position:fixed) инлайновый
    *      background: white = «Нормальная»,
    *      black = «Омская»
    */

    function ketDetectTheme() {
        var node = document.querySelector('.js-poo-target');

        while (node && node.nodeType == 1) {
            var bg = node.style ? node.style.backgroundColor : '';

            if (/^black$/i.test(bg) || bg == 'rgb(0, 0, 0)')
                return 'omsk';

            if (/^white$/i.test(bg) || bg == 'rgb(255, 255, 255)')
                return 'normal';

            node = node.parentNode;
        }

        // запасной вариант — по подключённому файлу стилей
        var links = document.getElementsByTagName('link');
        for (var i = 0; i < links.length; i++) {
            if (/production-omsk\.css/.test(links[i].href || ''))
                return 'omsk';
        }

        return 'normal';
    }


    function ketMobileViewCSS(theme) {

        var themeCSS;

        if (theme == 'omsk') {
            themeCSS = `
    .l-left-panel-wrap,
    .l-right-panel-wrap {
        background-color: #000;
        border-color: #444444;
    }
    .l-left-panel-wrap.mv-panel-shown,
    .l-right-panel-wrap.mv-panel-shown {
        box-shadow: 0 0 40px #000000, 0 0 0 100vw #00000069;
    }
    .mv-panel-shown::after {
        background-color: black;
    }
    .mv-panel-toggle-inmenu {
        color: #a4a4a4;
    }
    .mv-panel-toggle-inmenu:hover {
        color: #d2d2d2;
    }
    .mv-panel-toggle-inpanel {
        color: #a4a4a4;
    }
    .mv-panel-toggle-inpanel:hover {
        color: #d5d5d5;
    }
`;
        } else {
            themeCSS = `
    .l-left-panel-wrap,
    .l-right-panel-wrap {
        background-color: #fff;
        border-color: #bbbbbb;
    }
    .l-left-panel-wrap.mv-panel-shown,
    .l-right-panel-wrap.mv-panel-shown {
        box-shadow: 0 0 40px #000000, 0 0 0 100vw #00000069;
    }
    .mv-panel-toggle-inmenu {
        color: #7f7f7f;
    }
    .mv-panel-toggle-inmenu:hover {
        color: #000;
    }
`;
        }

        return `

/* ----- базовые правила (как у форка, вне media-запросов) ----- */

.l-left-panel-wrap,
.l-right-panel-wrap {
    transition: transform 0s, visibility 0s;
}

.mv-panel-toggle {
    display: none;
}

/* ----- выдвижные панели: @media (max-width: 1060px) форка ----- */

@media (max-width: 1060px) {
    body {
        min-width: auto;
    }
    .l-left-panel-wrap,
    .l-right-panel-wrap {
        position: fixed;
        top: 0;
        z-index: 3;
        height: 100%;
        border: 0px solid;
        width: 200px;
        visibility: hidden;
        overflow: auto;
    }
    .l-left-panel-wrap.mv-panel-transition,
    .l-right-panel-wrap.mv-panel-transition {
        transition: transform .2s, visibility 0s .2s;
    }
    .l-left-panel-wrap.mv-panel-transition.mv-panel-shown,
    .l-right-panel-wrap.mv-panel-transition.mv-panel-shown {
        transition: transform .2s;
    }
    .l-left-panel-wrap {
        left: 0;
        transform: translate(-100%, 0);
        border-right-width: 1px;
    }
    .l-right-panel-wrap {
        right: 0;
        transform: translate(100%, 0);
        border-left-width: 1px;
    }
    .l-left-panel-wrap.mv-panel-shown,
    .l-right-panel-wrap.mv-panel-shown {
        transform: none;
        visibility: visible;
    }
    .mv-panel-shown::before {
        content: "";
        width: 100%;
        height: 100%;
        left: 0;
        top: 0;
        position: fixed;
        z-index: -1;
        transition: none;
    }
    .mv-panel-shown::after {
        content: "";
        width: 100%;
        height: 100%;
        position: absolute;
        left: 0px;
        top: 0px;
        z-index: -1;
    }
    .b-menu-panel .b-menu-panel_b-links ul {
        width: 100%;
    }
    .b-menu-panel .b-menu-panel_b-links ul li {
        border-radius: 0;
        padding: 8px 10px;
    }
    .b-links-panel {
        margin: 0 10px;
    }
    .b-links-panel .b-links-panel_b-links .b-live-entry {
        width: auto;
        margin: 16px 0;
    }
    .b-top-panel {
        display: flex;
        flex-wrap: wrap;
        height: auto;
        width: 100%;
        padding: 0 32px;
        box-sizing: border-box;
        position: relative;
    }
    .b-top-panel ul {
        padding-left: 6px;
        padding-bottom: 5px;
        width: 100%;
    }
    .mv-panel-toggle {
        display: inline-block;
        position: absolute;
        cursor: pointer;
        width: 24px;
    }
    .mv-panel-toggle-inmenu {
        top: 0px;
        height: 100%;
        border-radius: 3px;
    }
    .mv-panel-toggle-inmenu-left {
        left: 0px;
    }
    .mv-panel-toggle-inmenu-right {
        right: 0px;
    }
    .mv-panel-toggle-inmenu::before {
        content: '';
        height: 2px;
        background: currentColor;
        width: 13px;
        position: absolute;
        left: 6px;
        top: 50%;
        translate: 0 calc(-100% - 3px);
        /* три полоски гамбургера: сама полоска + две тенями
           (у форка это правило лежит в themes/omsk.css) */
        box-shadow: 0 2px 0 transparent, 0 4px 0 currentColor, 0 6px 0 transparent, 0 8px 0 currentColor;
    }
    .mv-panel-toggle-inpanel {
        height: 24px;
        top: 0px;
        transition: color .2s;
    }
    .l-left-panel-wrap .mv-panel-toggle {
        right: 0;
    }
    .l-right-panel-wrap .mv-panel-toggle {
        left: 0;
    }
    .mv-panel-toggle-inpanel::before,
    .mv-panel-toggle-inpanel::after {
        content: '';
        background: currentColor;
        height: 2px;
        width: 16px;
        position: absolute;
        top: 50%;
        transform: translate(0, -1px) rotate(45deg);
        left: 4px;
    }
    .mv-panel-toggle-inpanel::after {
        transform: translate(0, -1px) rotate(-45deg);
    }
${themeCSS}
}

/* ----- кака: @media (max-width: 945px) форка ----- */
/* у 1chan.ca стили каки инлайновые, поэтому !important */

@media (max-width: 945px) {
    .js-poo-wrapper {
        position: fixed;
        bottom: 3px !important;
        right: 3px !important;
        margin-left: 0 !important;
        scale: .5;
        opacity: .7;
        transform-origin: bottom right;
        transition: scale .2s, opacity .2s;
    }
    .js-poo-wrapper:hover {
        scale: 1;
        opacity: 1;
    }
}

/* ----- панели во всю ширину на узких экранах (форк, 420px) ----- */

@media (max-width: 420px) {
    .l-left-panel-wrap,
    .l-right-panel-wrap {
        width: 100%;
    }
}

/* ----- базовое центрирование «×» (у форка идёт после media) ----- */

.mv-panel-toggle-inpanel {
    width: 100%;
    position: relative;
}
.mv-panel-toggle-inpanel::before,
.mv-panel-toggle-inpanel::after {
    left: 50%;
    transform: translate(-50%, -1px) rotate(45deg);
}
.mv-panel-toggle-inpanel::after {
    transform: translate(-50%, -1px) rotate(-45deg);
}

@media (max-width: 700px) {
    .ket-smile-panel {
        width: calc(100% - 2px) !important;
    }
    #comment_form .ket-smile-panel {
        width: calc(100% - 30px) !important;
    }
    .b-board-form .ket-smile-panel {
        width: calc(100% - 30px) !important;
    }
}
`;
    }

    function ketWidenMobileBreakpoint() {
        var cssText = '';

        for (var s = 0; s < document.styleSheets.length; s++) {
            var rules;

            try {
                rules = document.styleSheets[s].cssRules;
            } catch(e) {
                continue;
            }

            if (!rules)
                continue;

            for (var r = 0; r < rules.length; r++) {
                var rule = rules[r];
                var mediaText = rule.conditionText ||
                    (rule.media ? rule.media.mediaText : '');

                if (!mediaText || !rule.cssRules || !/max-width/.test(mediaText))
                    continue;

                cssText += '@media ' +
                    mediaText.replace(/max-width:\s*670px/, 'max-width: 700px') +
                    ' {\n';

                for (var k = 0; k < rule.cssRules.length; k++)
                    cssText += rule.cssRules[k].cssText + '\n';

                cssText += '}\n';
            }
        }

        if (!cssText)
            return;

        var style = document.createElement('style');
        style.id = 'ket-mobile-breakpoint';
        style.textContent = cssText;
        document.head.appendChild(style);
    }

    function ketInitMobilePanels() {
        $('.b-top-panel').prepend(
            '<div class="mv-panel-toggle mv-panel-toggle-inmenu mv-panel-toggle-inmenu-left" data-panel="left"></div>' +
            '<div class="mv-panel-toggle mv-panel-toggle-inmenu mv-panel-toggle-inmenu-right" data-panel="right"></div>'
        );

        $('.mv-panel-toggle-inmenu').each(function() {
            var $t = $(this);
            var sel = '.l-' + $t.data('panel') + '-panel-wrap';

            $t.click(function() {
                var $p = $(sel);
                if (!$p.hasClass('mv-panel-shown')) {
                    $p.addClass('mv-panel-shown mv-panel-transition');
                }
            });
        });

        var sides = ['left', 'right'];

        for (var i = 0; i < sides.length; i++) {
            (function(lr) {
                var $p = $('.l-' + lr + '-panel-wrap');

                if (!$p.length)
                    return;

                var hide = function() {
                    $p.removeClass('mv-panel-shown');
                    setTimeout(function() {
                        $p.removeClass('mv-panel-transition');
                    }, 200);
                };

                $p.click(function(ev) {
                    var bcr = $p[0].getBoundingClientRect();

                    if (
                        (lr == 'left' && ev.pageX > bcr.width) ||
                        (lr == 'right' && ev.pageX < bcr.x)
                    ) {
                        hide();
                    }
                });

                $('<div class="mv-panel-toggle mv-panel-toggle-inpanel"></div>')
                    .prependTo($p)
                    .click(hide);
            })(sides[i]);
        }
    }





   /*
    *      Точка входа мобильного вида
    */

    function ketInitMobileView() {
        var theme = ketDetectTheme();
        var pooTarget = document.querySelector('.js-poo-target');
        if (
            pooTarget &&
            pooTarget.parentNode &&
            pooTarget.parentNode.nodeType == 1
        )
            pooTarget.parentNode.classList.add('js-poo-wrapper');

        var style = document.createElement('style');
        style.id = 'ket-mobile-view';

        ketWidenMobileBreakpoint();

        style.textContent = ketMobileViewCSS(theme);
        document.head.appendChild(style);

        ketInitMobilePanels();
    }









   /*
    *      Main
    */

    function createScrollButtons() {
        if (document.getElementById('ket-scroll-buttons'))
            return;

        if(
            /\.ca\/alone\/?\d*/.test(document.URL) ||
            /\.ca\/alone\/res\/?\d*/.test(document.URL) ||
            /\.ca\/int\/?\d*/.test(document.URL) ||
            /\.ca\/int\/res\/?\d*/.test(document.URL) ||
            /\.ca\/rail\/?\d*/.test(document.URL) ||
            /\.ca\/rail\/res\/?\d*/.test(document.URL) ||
            /\.ca\/oo\/?\d*/.test(document.URL) ||
            /\.ca\/oo\/res\/?\d*/.test(document.URL) ||
            /\.ca\/news\/?\d*/.test(document.URL) ||
            /\.ca\/news\/res\/?\d*/.test(document.URL) ||
            /\.ca\/news\/all\/?\d*/.test(document.URL) ||
            /\.ca\/news\/all\/res\/?\d*/.test(document.URL) ||
            /\.ca\/news\/hidden\/?\d*/.test(document.URL) ||
            /\.ca\/news\/hidden\/?\d*/.test(document.URL) ||
            /\.ca\/news\/fav\/?\d*/.test(document.URL) ||
            /\.ca\/service\/modlog\/?\d*/.test(document.URL)
        ) {} else {
            return;
        }

        var container = document.createElement('div');

        container.id = 'ket-scroll-buttons';
        container.className = 'scroll-buttons';
        container.setAttribute("style", 'position: fixed; top: 120px;right: 10px;bottom: 120px;z-index: 2001;');

        var up = document.createElement('a');

        up.href = "#";
        up.className = 'scroll-butt scroll-up b-comment';
        up.setAttribute("style", 'display: flex;position: absolute;width:60px;height: 60px;transition: 0.3s;top: 0;right: 0;box-sizing: border-box;padding:0;margin:0');

        up.onclick = function(e) {
            e.preventDefault();

            window.scrollTo(0, 0);

            return false;
        };

        var upSpan = document.createElement('span');
        upSpan.className = 'scroll-svg-up';
        upSpan.setAttribute("style", 'width: 100%;height: 100%;display: flex;justify-content:center;align-items:center;background-repeat: no-repeat;background-position: center;background-size: contain;');

        var upDiv = document.createElement('div');
        upDiv.setAttribute("style", 'height: 1em;display: flex;align-items: end;overflow: clip;');

        var upImg = document.createElement('img');

        ketImg(upImg, 'https://1chan.ca/ico/new.png');
        upImg.alt = '';
        upImg.style.display = 'block';
        upImg.style.height = '16px';
        upImg.style.width = '16px';
        upImg.style.transform = 'rotate(180deg)';

        upSpan.appendChild(upDiv);
        upDiv.appendChild(upImg);
        up.appendChild(upSpan);

        var down = document.createElement('a');

        down.href = "#";
        down.className = 'scroll-butt scroll-down b-comment';
        down.setAttribute("style", 'display: flex;position: absolute;width:60px;height: 60px;transition: 0.3s;bottom: 0;right: 0;box-sizing: border-box;padding:0;margin:0');

        down.onclick = function(e) {
            e.preventDefault();

            window.scrollTo(
                0,
                Math.max(
                    document.body.scrollHeight,
                    document.documentElement.scrollHeight
                )
            );

            return false;
        };

        var downSpan = document.createElement('span');
        downSpan.className = 'scroll-svg-down';
        downSpan.setAttribute("style", 'width: 100%;height: 100%;display: flex;justify-content:center;align-items:center;background-repeat: no-repeat;background-position: center;background-size: contain;');

        var downDiv = document.createElement('div');
        downDiv.setAttribute("style", 'height: 1em;display: flex;align-items: start;overflow: clip;');

        var downImg = document.createElement('img');

        ketImg(downImg, 'https://1chan.ca/ico/new.png');
        downImg.alt = '';
        downImg.style.display = 'block';
        downImg.style.height = '16px';
        downImg.style.width = '16px';

        downSpan.appendChild(downDiv);
        downDiv.appendChild(downImg);
        down.appendChild(downSpan);

        container.appendChild(up);
        container.appendChild(down);

        document.body.appendChild(container);
    }

    function letTheSobakOut() {
        var foundedKAKA4 = document.querySelectorAll('.b-top-panel');
        if (foundedKAKA4.length === 0)
            return;

        var savedSettings =
            localStorage.getItem('settings' + VERSION);

        if (savedSettings !== null && savedSettings !== '') {
            enabledFeatures = savedSettings.split(' ');

            for(var i = enabledFeatures.length - 1; i >= 0; i--) {
                if (!enabledFeatures[i])
                    enabledFeatures.splice(i, 1);
            }
        } else {
            enabledFeatures = [];

            for(var i = 0; i < features.length; i++) {
                if (features[i] != 'scroll-buttons')
                    enabledFeatures.push(features[i]);
            }

            var str = '';

            for(var i = 0; i < enabledFeatures.length; i++)
                str += enabledFeatures[i] + ' ';

            localStorage[
                'settings' + VERSION
            ] = str;
        }

        settingsPosition =
            localStorage.getItem(
                'settings-position' + VERSION
            ) || 'both';

        smilesMode =
            localStorage.getItem('smiles-mode') || 'smilesAll';

        formTextarea =
            document.getElementById("comment_form_text");

        if (!formTextarea)
            formTextarea =
                document.getElementsByName("text")[0];

        initSmileyRendering();

        ketImgCacheInit();
        ketImgPreload();

        // Запоминаем последнее активное поле ввода (вставка
        // смайлов/разметки идёт в него, а не в первое по счёту)
        document.addEventListener('focus', function(e) {
            ketTrackTextarea(e.target);
        }, true);
        document.addEventListener('mousedown', function(e) {
            ketTrackTextarea(e.target);
        }, true);

        if (formTextarea) {
            if (
                enabledFeatures.indexOf("answermap") != -1
            ) {
                initAnswersPreviewCloser();
                createRepliesMap();
            }

            if (
                enabledFeatures.indexOf("hiding") != -1
            ) {
                hidePosts();
            }

            registerAutoupdateHandler();

            deletingSmiles = false;

            if (
                enabledFeatures.indexOf("markup") != -1
            ) {
                createMarkupPanel(formTextarea);
            }

            if (
                enabledFeatures.indexOf("smiles") != -1
            ) {
                createSmilePanel(formTextarea);
            }
        } else {
            if (
                enabledFeatures.indexOf("hiding") != -1 ||
                enabledFeatures.indexOf("hide-short-news") != -1
            ) {
                hideThreads();
            }
        }

        if (
            enabledFeatures.indexOf("spoilers") != -1
        ) {
            revealSpoilers();
        }

        if (
            enabledFeatures.indexOf("img-spoilers") != -1
        ) {
            revealImageSpoilers();
        }

        if (
            enabledFeatures.indexOf("scroll-buttons") != -1
        ) {
            createScrollButtons();
        }

        createMenu();

        registerQuickReplyWatcher();

        ketInitMobileView();
    }

    if(navigator.appName == "Opera")
        document.addEventListener('DOMContentLoaded', letTheSobakOut);
    else {
        letTheSobakOut();
    }

})(document);
