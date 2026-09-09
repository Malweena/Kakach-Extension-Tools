// ==UserScript==
// @name        Kakach Extension Tools
// @author      Original by postman, ayakudere, theanonym; forked by Ananim; modernized by malweena
// @description Какаческрипт с блэкджеком и шлюхами (какач онли)
// @version     2.0.0 (ca)
// @icon        https://web.archive.org/web/20260616043953im_/https://1chan.ca/ico/favicons/1chan.ca.png
// @downloadURL https://github.com/Malweena/Kakach-Extension-Tools/raw/master/Kakachuserscript.user.js
// @match       https://1chan.ca/*
// @match       https://*.1chan.ca/*
// @grant       none
// ==/UserScript==

(function(document) {

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
        "sosak", "turtle", "cancer"
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

                var id =
                    $(this)
                        .text()
                        .replace(/\D/g, "");

                var el =
                    $("#comment_" + id);

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
                        location.protocol +
                        "//" +
                        location.host +
                        "/news/last_comments/",
                        {
                            id: id
                        },
                        function(data, status) {

                            if (
                                status != "error" &&
                                data != false
                            ) {

                                var tip =
                                    $(template(
                                        "template_comment",
                                        data
                                    ))
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
                                            data.post_preview
                                                ? "520px"
                                                : "450px",
                                        position: "absolute",
                                        top: e.pageY + 8,
                                        left: e.pageX + 8
                                    });

                                if (data.post_preview) {

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

                                } else {

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
        repliesTable = {};
        var comments = document.getElementsByClassName("b-comment");

        for(var i=0; i<comments.length; i++) {
            current_post = comments[i].id.slice(locationPrefix == 'news' ? 8 :
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
        for(post_num in repliesTable) {
            container = document.createElement("div");
            container.id = "answers_"+post_num;
            container.appendChild(document.createElement('p'));
            container = container.lastChild;
            container.style.margin = '0px';
            container.style.padding = '4px';
            container.style.fontSize = '0.8em';
            container.textContent = "Ответы: ";
            for(post_ref in repliesTable[post_num]) {
                link = document.createElement("a");
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
            comment = document.getElementById("comment" +
                (locationPrefix == 'news' ? '_' : ('_' + locationPrefix + '_')) + post_num);
            if(comment)
                comment.appendChild(container.parentNode);
      }
      rebindAnswersPreview();
    }

    function registerAutoupdateHandler() {
        if(/\.ca\/news\/add/.test(document.URL))
            return;
        document.getElementsByClassName("l-comments-wrap")[0].addEventListener('DOMNodeInserted',
            function(event) {
                if(/comment/.test(event.target.id)) {
                    // Hiding
                    if(enabledFeatures.indexOf("hiding")!= -1) {
                        var match = false;
                        for(var j=0; j<hidePatterns.length; j++)
                            if(hidePatterns[j].test(event.target.textContent)) {
                                hidePost(event.target);
                                break;
                            }
                        var hideButton = event.target.getElementsByClassName('b-comment_b-info')[0]
                                        .getElementsByClassName('js-remove-button')[0];
                        hideButton.getElementsByTagName('img')[0].setAttribute("src", icons['hide']);
                        hideButton.style.display = "inline-block";
                        hideButton.onclick = function() {
                            hidePost(this.parentNode.parentNode);
                            return false;
                        };
                    }
                    // Answer map
                    if(enabledFeatures.indexOf("answermap")!= -1){
                        refs = event.target.getElementsByClassName("js-cross-link");
                        for(var j=0; j<refs.length; j++) {
                            ref = refs[j].name.slice(locationPrefix.length + 1);
                            link = document.createElement("a");
                            link.className = "js-cross-link";
                            var current_post = event.target.id.slice(locationPrefix == 'news' ? 8 :
                                (locationPrefix.length + 9) );
                            const urlObj = new URL(document.URL);
                            link.href = urlObj.pathname + urlObj.search + '#' + current_post;
                            link.name = locationPrefix + "/" + current_post;
                            link.textContent = ">>" + current_post;
                            link.style.fontSize = '1em';
                            if(container = document.getElementById('answers_'+ref)) { // да, именно =
                                container = container.lastChild
                                container.innerHTML += ', ';
                                container.appendChild(link)
                            } else {
                                container = document.createElement("div");
                                container.id = "answers_" + ref;
                                container.appendChild(document.createElement('p'));
                                container = container.lastChild;
                                container.style.margin = '0px';
                                container.style.padding = '4px';
                                container.style.fontSize = '0.8em';
                                container.textContent = "Ответы: ";
                                container.appendChild(link)
                                comment = document.getElementById("comment" +
                                (locationPrefix == 'news' ? '_' : ('_' + locationPrefix + '_'))
                                + ref);
                                if(comment)
                                    comment.appendChild(container.parentNode);
                            }
                        }
                        rebindAnswersPreview();
                    }
                }
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
            hideButtons[i].getElementsByTagName('img')[0].setAttribute("src", icons['hide']);
            hideButtons[i].onclick = function() {
                hidePost(this.parentNode.parentNode);
                return false;
            }
            hideButtons[i].style.display = "inline-block";
        }

        var comments = document.getElementsByClassName('b-comment');
        for(var i=0; i < comments.length; i++){
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
        if(enabledFeatures.indexOf("show-hidden")!= -1) {
            node.getElementsByClassName('b-comment_b-body')[0].style.display = "none";
            var button = node.getElementsByClassName('b-comment_b-info')[0].getElementsByClassName('js-remove-button')[0];
            button.onclick = function() {
                showPost(node);
                return false;
            }
            button.getElementsByTagName('img')[0].setAttribute("src", icons['show']);
        } else {
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
        node.getElementsByClassName('b-comment_b-body')[0].style.display = "block";
        var button = node.getElementsByClassName('b-comment_b-info')[0].getElementsByClassName('js-remove-button')[0];
        button.onclick = function() {
            hidePost(node);
            return false;
        }
        button.getElementsByTagName('img')[0].setAttribute("src", icons['hide']);
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

        image.src = url;
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
                img.src = smile.url;
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

    function addTextToForm(text) {
        cursor_pos = formTextarea.selectionStart;
        var formText = formTextarea.value;
        formTextarea.value = formText.slice(0, cursor_pos)
                            + text
                            + formText.slice(formTextarea.selectionEnd);
        formTextarea.focus();
    };

    function wrapImageLink(link) {
        if (!link)
            return;
        if (/imgur/.test(link)) {
            var d = /imgur.com\/([^\]\[]+)/.exec(link);
			var c = d[1].replace('.jpg', '');
			var b = c.replace('.png', '');
			var a = b.replace('.gif', '');
            if (a) {
                return '[:' + a + ':]';
            }
        } else {
            return '[' + link + ']';
        }
    }

    function createSmile(text, imgLink) {

        var image = document.createElement("img");
        var link = document.createElement("a");

        link.href = "#";
        link.onclick = function(e) {
            if (deletingSmiles) {
                destroyCustomSmile(this.id);
            } else {
                addTextToForm(text);
                formTextarea.focus();
            }
            e.preventDefault();
            return false;
        };
        link.title = text;
        image.src = imgLink;
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
        addCustomImage(link, name);
        localStorage.setItem(id, link);
    }

    function addCustomImage(link, name) {

        var id = "image-" + name;
        var newImage = createButton(name, function(e) {
            if (deletingSmiles)
                destroyCustomImage(this.id);
            else {addTextToForm('"'+wrapImageLink(link)+'":'+link);
                formTextarea.focus();
            }
            e.preventDefault();
            return false;
        });

        newImage.onmousedown = function(e) {
            if (e.which === 2) {
                destroyCustomImage(this.id);
            }
            return false;
        };

        newImage.id = id;
        newImage.setAttribute("class", "add-image-button");

        var imageContainer = document.getElementById("image-container");
        imageContainer.appendChild(newImage);
        imageContainer.style.display = "block";
    }

    function destroyCustomImage(id) {
        localStorage.removeItem(id);
        document.getElementById("image-container").removeChild(document.getElementById(id));
        if (document.getElementsByClassName("add-image-button").length === 0)
            document.getElementById("image-container").style.display = "none";
    }

    // Custom Smiles

    function createCustomSmile(link) {

        var id  = "smile-"+link;

        if (localStorage.getItem(id)) {
            alert("Такой смайлик уже добавлен");
            return false;
        }
        addCustomSmile(link)
        localStorage.setItem(id, link);
    }

    function addCustomSmile(link) {

        var id  = "smile-"+link;
        var wrappedLink = wrapImageLink(link);
        if (!wrappedLink)
            return;
        var newSmile = createSmile('"' + wrappedLink + '":' + link, link);

        newSmile.onmousedown = function(e) {
            if (e.which === 2) {
                destroyCustomSmile(this.id);
            }
            return false;
        };
        newSmile.title = "Средняя кнопка мыши для удаления";
        newSmile.id = id;
        newSmile.setAttribute("class", "add-smile-link");
        document.getElementById("smile-panel").insertBefore(newSmile,
                                                        document.getElementById("image-container"));
    }

    function destroyCustomSmile(id) {
        localStorage.removeItem(id);
        document.getElementById("smile-panel").removeChild(document.getElementById(id));
    }

    function addSmileClick(e) {

        var link = prompt("Ссылка на картинку или имя файла на ргхосте:");
        var image = new Image();

        if (!link)
            return false;

        if (/([\d\w]{9})/.test(link))
            var num = /([\d\w]{9})/.exec(link)[1];

        image.src = link;
        image.onerror = function() {
            if(num) {
                link = "http://rghost.ru/" + num + "/image.png";
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
        e.preventDefault();
        return false;
    }

    function removeSmilesClick(e) {
        const redCross = icons['redCross'];
        const whiteCross = icons['whiteCross'];

        if (!deletingSmiles) {
            document.getElementById("remove-smiles-icon").src = whiteCross;
            deletingSmiles = true;
        } else {
            document.getElementById("remove-smiles-icon").src = redCross;
            deletingSmiles = false;
        }
        e.preventDefault();
        return false;
    }


    function createSmilePanel() {

        var container = document.createElement("div");
        var imageContainer = document.createElement("div");

        for(var i in gifSmileList) {
            var newSmile = createSmile(':'+gifSmileList[i]+':', "https://1chan.ca/img/" + gifSmileList[i] + ".gif");
            container.appendChild(newSmile);
        }
        for(var i in pngSmileList) {
            var newSmile = createSmile(':'+pngSmileList[i]+':', "https://1chan.ca/img/" + pngSmileList[i] + ".png");
            container.appendChild(newSmile);
        }
        for(var i in gifSmileListSVIN) {
            var newSmile = createSmile(':'+gifSmileListSVIN[i]+':', "https://web.archive.org/web/20260819210418im_/https://1chan.win/img/smilies/" + gifSmileListSVIN[i] + ".gif");
            container.appendChild(newSmile);
        }
        for(var i in pngSmileListSVIN) {
            var newSmile = createSmile(':'+pngSmileListSVIN[i]+':', "https://web.archive.org/web/20260819210418im_/https://1chan.win/img/smilies/" + pngSmileListSVIN[i] + ".png");
            container.appendChild(newSmile);
        }
        container.appendChild(createSmile(':oru2:', "https://web.archive.org/web/20260819210418im_/https://1chan.win/img/smilies/oru.png"));

        var addSmileLink  = document.createElement("a");
        var addSmileImg = document.createElement("img");
        addSmileImg.src = icons['addSmile'];
        addSmileLink.href = "#";
        addSmileLink.onclick = addSmileClick;
        addSmileLink.appendChild(addSmileImg);
        addSmileLink.title = "Добавить смайлик или картинку";

        var removeSmilesLink  = document.createElement("a");
        var removeSmilesImg = document.createElement("img");
        removeSmilesImg.src = icons['redCross'];
        removeSmilesImg.id = "remove-smiles-icon";
        removeSmilesLink.href = "#";
        removeSmilesLink.onclick = removeSmilesClick;
        removeSmilesLink.appendChild(removeSmilesImg);
        removeSmilesLink.title = "Удалить смайлики или картинки";

        var controlsContainer = document.createElement("span");
        controlsContainer.style.cssFloat = "right";
        controlsContainer.style.margin = "5px";

        controlsContainer.appendChild(addSmileLink);
        controlsContainer.appendChild(document.createElement("br"));
        controlsContainer.appendChild(removeSmilesLink);

        container.appendChild(controlsContainer);
        container.style.minHeight = "50px";

        if(/\.ca\/news\/add/.test(document.URL)) { // news/add
            container.style.width = '534px'
            container.style.border = "1px solid #999999";
            container.style.margin = "0 0 10px 0";
            container.id = "smile-panel";
            document.getElementsByName('text_full')[0].parentNode.insertBefore(container,
                                                        document.getElementsByName('text_full')[0]);
        }
        else {
            container.style.margin = "10px";
            container.style.paddingLeft = "8px";
            container.style.border = "1px solid #CCCCCC";
            container.style.borderRadius = "5px";
            container.id = "smile-panel";
            var formBody = formTextarea.parentNode.parentNode;
            formBody.parentNode.insertBefore(container, formBody);
        }

        if(/\.ca\/news/.test(document.URL)) {
            var images = [];
            for(var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if ((/^smile-/).test(key)) {
                    var link = localStorage.getItem(key);
                    addCustomSmile(link);
                } else if ((/^image-.+$/).test(key))
                    images.push(key);
            }

            imageContainer.id = "image-container";
            imageContainer.style.margin = "5px 6px 7px 0px";
            imageContainer.style.paddingTop = "2px";
            imageContainer.style.borderTop = "1px dashed #CCCCCC";

            container.appendChild(imageContainer);

            for(var i in images) {
                var name = /^image-(.+)$/.exec(images[i])[1];
                addCustomImage(localStorage.getItem(images[i]), name);
            }

            if (images.length === 0) {
                imageContainer.style.display = "none";
            }
        }

        if(enabledFeatures.indexOf("panel-hiding")!= -1)
            initSmilePanelHiding()
    }

    function initSmilePanelHiding() {

        var smilePanel = document.getElementById("smile-panel");
        var showButton = document.createElement("a");
        var showContainer = document.createElement("div");
        var hideButton = document.createElement("a");
        var hideContainer = document.createElement("div");

        showButton.onclick = function() {
            showSmilePanel();
            return false;
        };
        showButton.textContent = "Cмайлики и картинки";
        showButton.style.borderBottom = "1px dashed #3366CC";
        showButton.style.textDecoration = "none";
        showButton.href = "#";
        showContainer.appendChild(showButton);
        showContainer.style.display = "none";
        showContainer.style.fontSize = "0.65em";
        showContainer.id = "show-panel-button";

        hideButton.onclick = function() {
            hideSmilePanel();
            return false;
        };
        hideButton.textContent = "Спрятать панель";
        hideButton.style.borderBottom = "1px dashed #3366CC";
        hideButton.style.textDecoration = "none";
        hideButton.href = "#";
        hideContainer.appendChild(hideButton);
        hideContainer.style.fontSize = "0.65em";
        hideContainer.id = "hide-panel-button";

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
            hideSmilePanel();
    }

    function hideSmilePanel() {
        localStorage.setItem("smile_panel", "hidden");
        document.getElementById("smile-panel").style.display = "none";
        document.getElementById("show-panel-button").style.display = "block";
        document.getElementById("hide-panel-button").style.display = "none";
    }

    function showSmilePanel() {
        localStorage.setItem("smile_panel", "visible");
        document.getElementById("smile-panel").style.display = "block";
        document.getElementById("show-panel-button").style.display = "none";
        document.getElementById("hide-panel-button").style.display = "block";
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

    function imgClick() {

        var link = getSelectionText(formTextarea);

        if (link.length > 0) {
            addTextToForm(wrapImageLink(link));
        } else {
            addTextToForm(wrapImageLink(prompt('Ссылка на изображение:')));
        }
    }

    function quoteClick() {

        var text  = getSelectionText(formTextarea);
        var start = formTextarea.selectionStart;

        if (text.length > 0) {
            var formText = formTextarea.value;
            var lines = text.split("\n");
            for(var i in lines) {
                lines[i] = ">>" + lines[i].trim() + "<<";
            }
            addTextToForm(lines.join("\n"));
            if(lines.length == 1)
                formTextarea.setSelectionRange(start + 2, start + text.length + 2);
        } else {
            text = document.getSelection().toString();
            var lines = text.split("\n");
            for(var i in lines) {
              lines[i] = ">" + lines[i].trim();
            }
            addTextToForm(lines.join("\n"));
        }
    }

    function bigBoldClick() {

        var text = getSelectionText(formTextarea);
        var lines = text.split("\n");
        var cursor = formTextarea.selectionEnd;
        var start = formTextarea.selectionStart;
        const stars = "\n********************************************";

        if (text.length > 0) {
            for(var i in lines) {
                if (lines[i] !== "")
                    lines[i] += stars;
            }
            addTextToForm(lines.join("\n"));
        } else {
            formTextarea.value += stars;
        }

        formTextarea.focus();
        if(lines.length == 1 && text.length > 0)
            formTextarea.setSelectionRange(start, start + text.length);
        else
            formTextarea.setSelectionRange(cursor, cursor);
    }

    function bigImgClick() {

        var link = getSelectionText(formTextarea);

        if (link.length === 0)
            link = prompt('Полная ссылка на изображение на имгуре:');
        if (!link) {
            formTextarea.focus();
            return false;
        }if (/imgur/.test(link)) {
            var e = /imgur.com\/([^\]\[]+)/.exec(link);
			var d = e[1].replace('.jpg', '');
			var c = d.replace('.webm', '');
			var b = c.replace('.png', '');
			var a = b.replace('.gif', '');
            var num = a;
            link = "http://imgur.com/" + num + "/";
        }

        addTextToForm('"[:' + num + ':]":' + link + '');
    }

    function strikeThroughClick() {
        var text = getSelectionText(formTextarea);
        addTextToForm('<s>' + text + '</s>');
    }

    function yobaClick() {
        var selected_text = getSelectionText(formTextarea);
        var has_selected = selected_text.length != 0;

        if(has_selected)
           addTextToForm(yobaTranslate(selected_text));
        else
           formTextarea.value = yobaTranslate(formTextarea.value)
    }

    function createMarkupPanel() {

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

        for (var k in buttons)
            container.appendChild(createButton(k, buttons[k]));

        for(var k in markup) {
            var newButton = createButton(k, function() {
                var text = getSelectionText(formTextarea);
                var start = formTextarea.selectionStart;
                var selection = formTextarea.selectionStart != formTextarea.selectionEnd;
                var m = markup[this.value][0];
                text = wrapText(text, m);
                addTextToForm(text);
                if(selection)
                    formTextarea.setSelectionRange(start, start + text.length);
                else
                    formTextarea.setSelectionRange(start + m.length, start + m.length);
                });
            container.appendChild(newButton);
        }

        if(/\.ca\/news\/add/.test(document.URL)) {
            container.style.paddingTop = "4px";
            document.getElementsByName('text_full')[0].parentNode.insertBefore(container,
                                                        document.getElementsByName('text_full')[0])
            document.addEventListener('click', function(event){
                if(/text/.test(event.target.name))
                    formTextarea = event.target // Смена полей в news/add
                })
        } else {
            if(enabledFeatures.indexOf("markup-top") == -1) {
                container.style.display = "inline-block";
                formTextarea.parentNode.insertBefore(container,
                                document.getElementsByClassName("b-comment-form_b-uplink")[0]);
            } else {
                container.style.marginTop = "3px";
                formTextarea.style.margin = "3px 0px 6px"
                formTextarea.parentNode.insertBefore(container, formTextarea);
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


    function createFormSettingsMenu() {
        if (!formTextarea)
            return;

        if (!formTextarea.parentNode || !formTextarea.parentNode.parentNode)
            return;

        var container =
            formTextarea.parentNode.parentNode.getElementsByTagName("div")[0];

        if (!container)
            return;

        var general = document.createElement("a");

        general.href = "#";
        general.className = "general-settings-button";
        general.id = "general-settings-button-form";

        var generalIcon = document.createElement("img");
        generalIcon.src = icons['settings'];

        general.appendChild(generalIcon);

        var hidelist = document.createElement("a");

        hidelist.href = "#";
        hidelist.className = "hiding-list-button";
        hidelist.id = "hiding-list-button-form";

        var regexpIcon = document.createElement("img");
        regexpIcon.src = icons['regexp'];

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

    function hideHideList() {
        var regexp =
            document.getElementById('regexps');

        if (regexp) {
            var menu = regexp.parentNode;

            if (menu)
                menu.parentNode.removeChild(menu);
        }

        setMenuButtonAction(
            'hiding-list-button',
            displayHideList
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
            'padding:5px; height:fit-content; position: relative !important'
        );

        container.setAttribute(
            "class",
            "b-mod-toolbar"
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

        positionDesc.style.display = 'inline';
        positionDesc.style.fontSize = '0.75em';

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

    function displayHideList() {
        var container = document.createElement("div");

        setMenuButtonAction(
            'hiding-list-button',
            hideHideList
        );
        container.setAttribute("style", "top: 5px; left:5px; position:fixed; \
        z-index: 10000; background: #EAF4FF; border: 1px black")
        var list = document.createElement("textarea")
        list.id = "regexps"
        list.setAttribute("style", "width: 300px; height: 300px; margin:5px")
        for(var key in localStorage)
            if(/hidephrase/.test(key))
                list.value += localStorage[key] + '\n'
        var button = document.createElement("button")
        button.textContent = "Сохранить"
        button.onclick = updateRegexps;
        button.style.margin = "5px"
        container.appendChild(list)
        container.appendChild(document.createElement("br"))
        container.appendChild(button)
        document.getElementsByTagName("body")[0].appendChild(container)
        return false;
    }

    function updateRegexps() {
        document.getElementById('hiding-list-button').onclick = displayHideList;
        for(var key in localStorage)
            if(/hidephrase/.test(key))
                localStorage.removeItem(key);
        regexps = document.getElementById('regexps').value.split('\n');
        for(var i = 0; i < regexps.length; i++) {
            if(regexps[i] != "") {
                localStorage.setItem("hidephrase" + i, regexps[i]);
            }
        }
        menu = document.getElementById('regexps').parentNode;
        menu.parentNode.removeChild(menu);
    }


   /*
    *      Main
    */

    function createScrollButtons() {
        if (document.getElementById('ket-scroll-buttons'))
            return;

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

        var upImg = document.createElement('img');

        upImg.src = 'https://1chan.ca/ico/new.png';
        upImg.alt = '';
        upImg.style.display = 'block';
        upImg.style.height = '16px';
        upImg.style.width = '16px';
        upImg.style.transform = 'rotate(180deg)';

        upSpan.appendChild(upImg);
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

        var downImg = document.createElement('img');

        downImg.src = 'https://1chan.ca/ico/new.png';
        downImg.alt = '';
        downImg.style.display = 'block';
        downImg.style.height = '16px';
        downImg.style.width = '16px';

        downSpan.appendChild(downImg);
        down.appendChild(downSpan);

        container.appendChild(up);
        container.appendChild(down);

        document.body.appendChild(container);
    }

    function letTheSobakOut() {
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

        formTextarea =
            document.getElementById("comment_form_text");

        if (!formTextarea)
            formTextarea =
                document.getElementsByName("text")[0];

        initSmileyRendering();

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
                createMarkupPanel();
            }

            if (
                enabledFeatures.indexOf("smiles") != -1
            ) {
                createSmilePanel();
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
    }

    if(navigator.appName == "Opera")
        document.addEventListener('DOMContentLoaded', letTheSobakOut);
    else {
        letTheSobakOut();
    }

})(document);
