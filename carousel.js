// ── Hero Visualization Carousel ──
(function() {
    var heroEl = document.getElementById('heroCarousel');
    if (!heroEl) return;

    var names = ['Note Highway','Half-pipe','Playhead','Tubular','Scrolling History','Circular'];
    var vizImgs = heroEl.querySelectorAll('img');
    var vizLabel = document.getElementById('heroLabel');
    var vizCur = 0, vizTotal = vizImgs.length, vizTimer;

    function vizShow(idx) {
        vizImgs[vizCur].classList.remove('active');
        vizCur = ((idx % vizTotal) + vizTotal) % vizTotal;
        vizImgs[vizCur].classList.add('active');
        if (vizLabel) vizLabel.textContent = names[vizCur];
    }
    function vizStart() { vizTimer = setInterval(function() { vizShow(vizCur + 1); }, 3500); }

    heroEl.addEventListener('click', function(e) {
        var rect = heroEl.getBoundingClientRect();
        clearInterval(vizTimer);
        vizShow(e.clientX - rect.left < rect.width / 2 ? vizCur - 1 : vizCur + 1);
        vizStart();
    });
    vizStart();
})();

// ── AUv3 Host Carousel ──
(function() {
    var el = document.getElementById('auv3Carousel');
    if (!el) return;

    var names = ['Loopy Pro', 'Logic Pro (iPad)', 'AUM', 'Logic Pro (Mac)'];
    var imgs = el.querySelectorAll('img');
    var label = document.getElementById('auv3Label');
    var cur = 0, total = imgs.length, timer;

    function show(idx) {
        imgs[cur].classList.remove('active');
        cur = ((idx % total) + total) % total;
        imgs[cur].classList.add('active');
        if (label) label.textContent = names[cur];
    }
    function start() { timer = setInterval(function() { show(cur + 1); }, 3500); }

    el.addEventListener('click', function(e) {
        var rect = el.getBoundingClientRect();
        clearInterval(timer);
        show(e.clientX - rect.left < rect.width / 2 ? cur - 1 : cur + 1);
        start();
    });
    start();
})();

// ── Band Sync Carousel ──
(function() {
    var el = document.getElementById('bandsyncCarousel');
    if (!el) return;

    var imgs = el.querySelectorAll('img');
    var cur = 0, total = imgs.length, timer;

    function show(idx) {
        imgs[cur].classList.remove('active');
        cur = ((idx % total) + total) % total;
        imgs[cur].classList.add('active');
    }
    function start() { timer = setInterval(function() { show(cur + 1); }, 4000); }

    el.addEventListener('click', function(e) {
        var rect = el.getBoundingClientRect();
        clearInterval(timer);
        show(e.clientX - rect.left < rect.width / 2 ? cur - 1 : cur + 1);
        start();
    });
    start();
})();

// ── Session Summary Carousel ──
(function() {
    var el = document.getElementById('sessionCarousel');
    if (!el) return;

    var imgs = el.querySelectorAll('img');
    var cur = 0, total = imgs.length, timer;

    function show(idx) {
        imgs[cur].classList.remove('active');
        cur = ((idx % total) + total) % total;
        imgs[cur].classList.add('active');
    }
    function start() { timer = setInterval(function() { show(cur + 1); }, 4000); }

    el.addEventListener('click', function(e) {
        var rect = el.getBoundingClientRect();
        clearInterval(timer);
        show(e.clientX - rect.left < rect.width / 2 ? cur - 1 : cur + 1);
        start();
    });
    start();
})();

// ── Tip Browser ──
(function() {
    var carousel = document.getElementById('tipCarousel');
    var list = document.getElementById('tipList');
    if (!carousel || !list) return;

    var imgs = carousel.querySelectorAll('img');
    var items = list.querySelectorAll('li[data-index]');
    var total = imgs.length;
    var current = 0;
    var timer;
    var hovering = false;

    function show(idx) {
        imgs[current].classList.remove('active');
        items[current].classList.remove('active');
        current = ((idx % total) + total) % total;
        imgs[current].classList.add('active');
        items[current].classList.add('active');
    }

    function startTimer() {
        timer = setInterval(function() {
            if (!hovering) show(current + 1);
        }, 4000);
    }

    items.forEach(function(item) {
        item.addEventListener('mouseenter', function() {
            hovering = true;
            show(parseInt(item.dataset.index));
        });
        item.addEventListener('mouseleave', function() {
            hovering = false;
        });
    });

    startTimer();
})();
