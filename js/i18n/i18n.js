/**
 * Free IPTV Player — Localization Manager
 * Handles multilingual support (English & Arabic), true document RTL layout switching,
 * flat and nested key resolution, and dynamic UI updates.
 */

(function (window) {
  'use strict';

  window.FreeIPTV = window.FreeIPTV || {};

  var currentLocale = 'en';
  var translations = {};

  // Built-in English translation bundle (zero-latency bootstrap and offline-safe)
  translations.en = {
    'app.name': 'Free IPTV Player',
    'app.badge': 'Player',
    'header.search': 'Search',
    'header.settings': 'Settings',
    'nav.home': 'Home',
    'nav.live_tv': 'Live TV',
    'nav.favorites': 'Favorites',
    'nav.movies': 'Movies',
    'nav.series': 'Series',
    'nav.guide': 'TV Guide',
    'nav.search': 'Search',
    'nav.settings': 'Settings',
    'nav.playlists': 'Playlists',
    'playlists.title': 'Playlists & Providers',
    'playlists.subtitle': 'Manage IPTV connections, switch active playlist, or add a new source',
    'playlists.active_section': 'ACTIVE PLAYLIST',
    'playlists.all_section': 'SAVED PLAYLISTS',
    'playlists.no_active': 'No Active Playlist',
    'playlists.no_playlists': 'No playlists configured',
    'playlists.no_playlists_sub': 'Add an M3U or Xtream Codes playlist to begin.',
    'playlists.active_badge': 'ACTIVE',
    'playlists.btn_refresh': 'Reconnect / Refresh',
    'playlists.btn_rename': 'Rename',
    'playlists.btn_delete': 'Delete',
    'playlists.btn_activate': 'Activate',
    'playlists.rename_prompt': 'Enter new playlist name:',
    'playlists.confirm_delete': 'Are you sure you want to delete this playlist?',
    'playlists.channels_loading': 'Channels: Loading...',
    'playlists.channels_count': 'Channels: {count}',
    'live.preview_badge': 'PREVIEW',
    'live.preview_muted': 'Muted',
    'live.preview_idle': 'Focus a channel to preview',
    'live.preview_loading': 'Loading preview...',
    'live.preview_error': 'Preview unavailable',
    'live.loading': 'Loading...',
    'live.loading_channels': 'Loading TV channels...',
    'live.state_no_provider': 'No IPTV playlist configured.',
    'live.state_no_provider_sub': 'Please add an IPTV playlist to begin.',
    'live.state_auth_failure': 'Unable to connect to IPTV provider.',
    'live.state_auth_failure_sub': 'Authentication failed. Please verify your username and password.',
    'live.state_connection_failure': 'Unable to connect to IPTV provider.',
    'live.state_connection_failure_sub': 'Check your internet connection or server host address.',
    'live.state_no_channels': 'No live TV channels were returned by this provider.',
    'live.state_no_channels_sub': 'The provider account has no live broadcast channels.',
    'live.state_norm_failure': 'Provider returned data, but no playable channels could be loaded.',
    'live.state_norm_failure_sub': 'Stream format returned by the provider is unsupported.',

    'home.welcome': 'Welcome to Free IPTV Player',
    'home.subtitle': 'Add your IPTV playlist to get started.',
    'playlist.add': 'Add Playlist',
    'home.empty_title': 'No playlist has been configured yet.',
    'home.empty_desc': 'Free IPTV Player is an independent media player and does not provide, host, or bundle any channels or streams. Please add your authorized M3U or IPTV provider URL to begin.',
    'home.continue_watching': 'Continue Watching',
    'home.recently_watched': 'Recently Watched',
    'home.browse_content': 'Browse Content',
    'home.stat_channels': 'Channels',
    'home.stat_movies': 'Movies',
    'home.stat_series': 'Series',
    'home.quick_access': 'Quick Access',

    'hints.navigate': 'Navigate',
    'hints.select': 'Select',
    'hints.back': 'Back',
    'hints.exit': 'Exit',

    'modal.add_playlist.title': 'Add IPTV Playlist',
    'modal.tab_m3u': 'M3U / M3U8',
    'modal.tab_xtream': 'XTREAM CODES',
    'modal.playlist_name': 'Playlist Name',
    'modal.playlist_name_placeholder': 'e.g. My IPTV',
    'modal.playlist_url': 'Playlist URL',
    'modal.playlist_url_placeholder': 'https://example.com/playlist.m3u',
    'modal.xtream_server': 'Server / Host',
    'modal.xtream_server_placeholder': 'Enter server URL',
    'modal.xtream_username': 'Username',
    'modal.xtream_username_placeholder': 'Username',
    'modal.xtream_password': 'Password',
    'modal.xtream_password_placeholder': 'Password',
    'modal.btn_add': 'Add Playlist',
    'modal.btn_login': 'LOGIN',
    'modal.btn_cancel': 'Cancel',
    'modal.btn_retry': 'Retry',
    'modal.loading': 'Downloading & Parsing Playlist...',
    'modal.loading_sub': 'Please wait while channels are loaded',
    'modal.loading_xtream': 'Connecting to Xtream Server...',
    'modal.loading_xtream_sub': 'Authenticating and fetching live channels',
    'modal.error_title': 'Unable to Load Playlist',
    'modal.error.invalid_server': 'Invalid server URL',
    'modal.error.username_required': 'Username is required',
    'modal.error.password_required': 'Password is required',
    'modal.error.login_failed': 'Login failed',
    'modal.error.server_connect': 'Unable to connect to server',
    'modal.error.auth_failed': 'Authentication failed',

    'live.title': 'Live TV',
    'live.search_placeholder': 'Search channels by name or category...',
    'live.categories': 'Categories',
    'live.all_channels': 'All Channels',
    'live.favorites_category': 'Favorites',
    'live.back_category': '.. Back',
    'live.no_channels': 'No channels found',
    'live.no_channels_sub': 'Try selecting another category or changing your search query.',
    'live.selected_notice': 'Channel Selected: {name}',
    'live.channel_count': '{count} Channels',
    'live.epg_header': 'Program Guide',
    'live.now_playing': 'Now Playing',
    'live.next_playing': 'Next',
    'live.upcoming': 'Upcoming Schedule',
    'live.epg_unavailable': 'EPG Unavailable',
    'live.no_epg': 'No program guide data available for this channel.',

    'movies.title': 'Movies',
    'movies.categories': 'Categories',
    'movies.all_movies': 'All Movies',
    'movies.no_movies': 'No movies found',
    'movies.count': '{count} Movies',
    'movies.movie_count': '{count} Movies',
    'movies.no_movies_sub': 'Try selecting another category or changing your search query.',
    'movies.resume_from': 'Resume from {time}',
    'movies.no_description': 'No overview available.',
    'movies.cast_label': 'Cast: ',
    'movies.remove_favorite': 'Remove Favorite',
    'movies.add_favorite': 'Favorite',

    'series.title': 'Series',
    'series.categories': 'Categories',
    'series.all_series': 'All Series',
    'series.no_series': 'No series found',
    'series.count': '{count} Series',
    'series.series_count': '{count} Series',
    'series.no_series_sub': 'Try selecting another category or changing your search query.',
    'series.loading_episodes': 'Loading seasons and episodes...',
    'series.no_description': 'No overview available.',
    'series.no_episodes': 'No episodes found for this season.',
    'series.remove_favorite': 'Remove Favorite',
    'series.add_favorite': 'Favorite',
    'series.seasons': 'Seasons:',
    'series.season': 'Season {num}',
    'series.episode': 'Episode {num}',

    'guide.title': 'TV Guide',
    'guide.badge': 'EPG Timeline',
    'guide.now_playing': 'NOW PLAYING',
    'guide.up_next': 'Upcoming Programs',
    'guide.watch_live': 'Watch Live',
    'guide.no_epg': 'No electronic program guide information available for this channel.',
    'guide.no_description': 'Live TV Broadcast',
    'guide.loading_epg': 'Loading program guide...',
    'guide.live_channel': 'LIVE CHANNEL',
    'guide.no_playlist': 'No active playlist. Add a playlist to view the TV Guide.',
    'guide.no_channels': 'No channels available in this playlist.',

    'search.input_placeholder': 'Search Live Channels, Movies, Series...',
    'search.searching': 'Searching across Live TV, Movies, and Series...',
    'search.section_live': 'Live TV Channels',
    'search.section_movies': 'Movies',
    'search.section_series': 'Series',
    'search.prompt_title': 'Search IPTV Content',
    'search.prompt_sub': 'Type at least 2 characters to search across Live Channels, Movies, and Series.',
    'search.no_results_title': 'No results found',
    'search.no_results_sub': 'No matches found for "{query}".',

    'favorites.title': 'Favorites',
    'favorites.tab_all': 'All',
    'favorites.tab_live': 'Live TV',
    'favorites.tab_movies': 'Movies',
    'favorites.tab_series': 'Series',
    'favorites.empty_title': 'No favorites yet',
    'favorites.empty_sub': 'Mark channels, movies, and series as favorites to quickly access them here.',

    'details.play': 'PLAY',
    'details.resume': 'RESUME',
    'details.favorite': 'Favorite',
    'details.favorited': 'In Favorites',
    'details.back': 'Back',
    'details.genre': 'Genre',
    'details.year': 'Year',
    'details.rating': 'Rating',
    'details.duration': 'Duration',

    'settings.title': 'Settings',
    'settings.playlists_title': 'Configured IPTV Playlists',
    'settings.no_playlists': 'No playlists configured yet.',
    'settings.btn_refresh': 'Refresh',
    'settings.btn_delete': 'Delete',
    'settings.btn_set_active': 'Set Active',
    'settings.active_badge': 'Active',
    'settings.last_updated': 'Updated: {time}',
    'settings.playback_title': 'Playback Preferences',
    'settings.auto_resume': 'Auto-resume playback from last position',
    'settings.auto_next_ep': 'Auto-play next episode in series',
    'settings.cache_title': 'EPG & Storage Controls',
    'settings.btn_clear_epg': 'Clear EPG Cache',
    'settings.epg_cache_cleared': 'EPG cache cleared successfully.',
    'settings.btn_clear_history': 'Clear Watch History',
    'settings.history_cleared': 'Playback history cleared.',
    'settings.diagnostics_title': 'Provider & Stream Diagnostics',
    'settings.diag_provider': 'Provider Status',
    'settings.diag_live': 'Live Channels',
    'settings.diag_movies': 'Movies (VOD)',
    'settings.diag_series': 'TV Series',
    'settings.diag_epg': 'EPG Status',
    'settings.diag_server': 'Host Server',
    'settings.diag_refresh': 'Refresh Content',
    'settings.language_title': 'Language',
    'settings.lang_en': 'English',
    'settings.lang_ar': 'العربية (Arabic)',
    'settings.about_title': 'About Free IPTV Player',
    'settings.about_stats': 'Saved Favorites: {favs} • Watch History: {hist}',
    'settings.about_disclaimer': 'Free IPTV Player is an independent media player client. It does not provide, host, or sell any IPTV subscriptions, channels, or copyrighted media streams. Users are solely responsible for their playlist sources.',

    'player.live': 'LIVE',
    'player.previous': 'Previous',
    'player.next': 'Next',
    'player.play': 'Play',
    'player.pause': 'Pause',
    'player.audio': 'Audio',
    'player.subtitles': 'Subs',
    'player.aspect': 'Aspect',
    'player.back': 'Back',
    'player.back_to_channels': 'Channels',
    'player.buffering': 'Buffering...',
    'player.loading': 'Loading stream...',
    'player.error_title': 'Unable to play this stream.',
    'player.error_desc': 'The stream may be unavailable or unsupported.',
    'player.retry': 'Retry',
    'player.dev_notice': 'Samsung AVPlay is unavailable in this environment (Running in development/mock mode)',
    'player.no_extra_audio': 'Default Audio',
    'player.no_subtitles': 'No Subtitles Available',
    'categories.search_placeholder': 'Search categories...'
  };

  // Built-in Arabic translation bundle (zero-latency bootstrap and offline-safe)
  translations.ar = {
    'app.name': 'مشغل IPTV المجاني',
    'app.badge': 'مشغل',
    'header.search': 'بحث',
    'header.settings': 'الإعدادات',
    'nav.home': 'الرئيسية',
    'nav.live_tv': 'البث المباشر',
    'nav.favorites': 'المفضلة',
    'nav.movies': 'الأفلام',
    'nav.series': 'المسلسلات',
    'nav.guide': 'دليل التلفزيون',
    'nav.search': 'البحث',
    'nav.settings': 'الإعدادات',
    'nav.playlists': 'قوائم التشغيل',
    'playlists.title': 'قوائم التشغيل والمزودين',
    'playlists.subtitle': 'إدارة اتصالات IPTV والتبديل بين القوائم أو إضافة مصدر جديد',
    'playlists.active_section': 'قائمة التشغيل النشطة',
    'playlists.all_section': 'قوائم التشغيل المحفوظة',
    'playlists.no_active': 'لا توجد قائمة نشطة',
    'playlists.no_playlists': 'لم تتم إضافة أي قائمة تشغيل',
    'playlists.no_playlists_sub': 'أضف قائمة M3U أو بيانات Xtream Codes للبدء.',
    'playlists.active_badge': 'نشط',
    'playlists.btn_refresh': 'إعادة الاتصال / تحديث',
    'playlists.btn_rename': 'إعادة تسمية',
    'playlists.btn_delete': 'حذف',
    'playlists.btn_activate': 'تفعيل',
    'playlists.rename_prompt': 'أدخل اسماً جديداً لقائمة التشغيل:',
    'playlists.confirm_delete': 'هل أنت متأكد من رغبتك في حذف قائمة التشغيل هذه؟',
    'playlists.channels_loading': 'القنوات: جارٍ التحميل...',
    'playlists.channels_count': 'القنوات: {count}',
    'live.preview_badge': 'معاينة',
    'live.preview_muted': 'مكتوم',
    'live.preview_idle': 'وجّه المؤشر لقناة لبدء المعاينة',
    'live.preview_loading': 'جارٍ تحميل المعاينة...',
    'live.preview_error': 'المعاينة غير متاحة',
    'live.loading': 'جارٍ التحميل...',
    'live.loading_channels': 'جارٍ تحميل القنوات...',
    'live.state_no_provider': 'لم يتم تكوين أي قائمة قنوات.',
    'live.state_no_provider_sub': 'يرجى إضافة قائمة قنوات للبدء.',
    'live.state_auth_failure': 'تعذر الاتصال بمزود IPTV.',
    'live.state_auth_failure_sub': 'فشلت المصادقة. يرجى التحقق من اسم المستخدم وكلمة المرور.',
    'live.state_connection_failure': 'تعذر الاتصال بمزود IPTV.',
    'live.state_connection_failure_sub': 'تحقق من اتصال الإنترنت أو عنوان الخادم.',
    'live.state_no_channels': 'لم يرجع هذا المزود أي قنوات بث مباشر.',
    'live.state_no_channels_sub': 'حساب المزود لا يحتوي على أي قنوات بث مباشر.',
    'live.state_norm_failure': 'أرجع المزود بيانات ولكن تعذر تحميل قنوات قابلة للتشغيل.',
    'live.state_norm_failure_sub': 'صيغة البث المرجعة من المزود غير مدعومة.',

    'home.welcome': 'مرحبًا بك في مشغل IPTV المجاني',
    'home.subtitle': 'أضف قائمة قنوات IPTV للبدء.',
    'playlist.add': 'إضافة قائمة قنوات',
    'home.empty_title': 'لم تتم إضافة أي قائمة قنوات بعد.',
    'home.empty_desc': 'مشغل IPTV المجاني هو تطبيق تشغيل وسائط مستقل ولا يوفر أو يستضيف أو يبيع أي قنوات أو بث مباشر. يرجى إضافة رابط M3U أو بيانات مزود الخدمة المعتمد للبدء.',
    'home.continue_watching': 'متابعة المشاهدة',
    'home.recently_watched': 'شوهد مؤخراً',
    'home.browse_content': 'تصفح المحتوى',
    'home.stat_channels': 'قناة',
    'home.stat_movies': 'فيلم',
    'home.stat_series': 'مسلسل',
    'home.quick_access': 'الوصول السريع',

    'hints.navigate': 'تنقل',
    'hints.select': 'اختيار',
    'hints.back': 'رجوع',
    'hints.exit': 'خروج',

    'modal.add_playlist.title': 'إضافة قائمة قنوات IPTV',
    'modal.tab_m3u': 'M3U / M3U8',
    'modal.tab_xtream': 'XTREAM CODES',
    'modal.playlist_name': 'اسم قائمة التشغيل',
    'modal.playlist_name_placeholder': 'مثال: قنواتي',
    'modal.playlist_url': 'رابط قائمة التشغيل',
    'modal.playlist_url_placeholder': 'https://example.com/playlist.m3u',
    'modal.xtream_server': 'الخادم / المضيف',
    'modal.xtream_server_placeholder': 'أدخل عنوان الخادم',
    'modal.xtream_username': 'اسم المستخدم',
    'modal.xtream_username_placeholder': 'اسم المستخدم',
    'modal.xtream_password': 'كلمة المرور',
    'modal.xtream_password_placeholder': 'كلمة المرور',
    'modal.btn_add': 'إضافة قائمة القنوات',
    'modal.btn_login': 'تسجيل الدخول',
    'modal.btn_cancel': 'إلغاء',
    'modal.btn_retry': 'إعادة المحاولة',
    'modal.loading': 'جارٍ تنزيل ومعالجة قائمة القنوات...',
    'modal.loading_sub': 'يرجى الانتظار أثناء تحميل القنوات',
    'modal.loading_xtream': 'جارٍ الاتصال بخادم Xtream...',
    'modal.loading_xtream_sub': 'جارٍ المصادقة وتحميل القنوات المباشرة',
    'modal.error_title': 'تعذر تحميل قائمة القنوات',
    'modal.error.invalid_server': 'عنوان الخادم غير صالح',
    'modal.error.username_required': 'اسم المستخدم مطلوب',
    'modal.error.password_required': 'كلمة المرور مطلوبة',
    'modal.error.login_failed': 'فشل تسجيل الدخول',
    'modal.error.server_connect': 'تعذر الاتصال بالخادم',
    'modal.error.auth_failed': 'فشلت المصادقة',

    'live.title': 'البث المباشر',
    'live.search_placeholder': 'ابحث عن القنوات بالاسم أو الفئة...',
    'live.categories': 'الفئات',
    'live.all_channels': 'جميع القنوات',
    'live.favorites_category': 'المفضلة',
    'live.back_category': '.. رجوع للخلف',
    'live.no_channels': 'لم يتم العثور على قنوات',
    'live.no_channels_sub': 'حاول اختيار فئة أخرى أو تغيير عبارة البحث.',
    'live.selected_notice': 'تم اختيار القناة: {name}',
    'live.channel_count': '{count} قناة',
    'live.epg_header': 'دليل البرامج',
    'live.now_playing': 'يعرض الآن',
    'live.next_playing': 'التالي',
    'live.upcoming': 'الجدول القادم',
    'live.epg_unavailable': 'الدليل غير متوفر',
    'live.no_epg': 'لا تتوفر بيانات دليل البرامج لهذه القناة.',

    'movies.title': 'الأفلام',
    'movies.categories': 'الفئات',
    'movies.all_movies': 'جميع الأفلام',
    'movies.no_movies': 'لم يتم العثور على أفلام',
    'movies.count': '{count} فيلم',
    'movies.movie_count': '{count} فيلم',
    'movies.no_movies_sub': 'حاول اختيار فئة أخرى أو تغيير عبارة البحث.',
    'movies.resume_from': 'استئناف من {time}',
    'movies.no_description': 'لا يتوفر وصف.',
    'movies.cast_label': 'طاقم العمل: ',
    'movies.remove_favorite': 'إزالة من المفضلة',
    'movies.add_favorite': 'إضافة للمفضلة',

    'series.title': 'المسلسلات',
    'series.categories': 'الفئات',
    'series.all_series': 'جميع المسلسلات',
    'series.no_series': 'لم يتم العثور على مسلسلات',
    'series.count': '{count} مسلسل',
    'series.series_count': '{count} مسلسل',
    'series.no_series_sub': 'حاول اختيار فئة أخرى أو تغيير عبارة البحث.',
    'series.loading_episodes': 'جارٍ تحميل المواسم والحلقات...',
    'series.no_description': 'لا يتوفر وصف.',
    'series.no_episodes': 'لا توجد حلقات لهذا الموسم.',
    'series.remove_favorite': 'إزالة من المفضلة',
    'series.add_favorite': 'إضافة للمفضلة',
    'series.seasons': 'المواسم:',
    'series.season': 'الموسم {num}',
    'series.episode': 'الحلقة {num}',

    'guide.title': 'دليل التلفزيون',
    'guide.badge': 'جدول البرامج',
    'guide.now_playing': 'يُعرض الآن',
    'guide.up_next': 'البرامج القادمة',
    'guide.watch_live': 'مشاهدة البث',
    'guide.no_epg': 'لا توجد معلومات دليل برامج متاحة لهذه القناة.',
    'guide.no_description': 'بث تلفزيوني مباشر',
    'guide.loading_epg': 'جارٍ تحميل دليل البرامج...',
    'guide.live_channel': 'قناة مباشرة',
    'guide.no_playlist': 'لا توجد قائمة قنوات نشطة. أضف قائمة لعرض دليل التلفزيون.',
    'guide.no_channels': 'لا توجد قنوات متاحة في هذه القائمة.',

    'search.input_placeholder': 'ابحث في القنوات المباشرة، الأفلام، والمسلسلات...',
    'search.searching': 'جارٍ البحث في القنوات، الأفلام، والمسلسلات...',
    'search.section_live': 'القنوات المباشرة',
    'search.section_movies': 'الأفلام',
    'search.section_series': 'المسلسلات',
    'search.prompt_title': 'البحث في المحتوى',
    'search.prompt_sub': 'اكتب حرفين على الأقل للبحث عبر القنوات المباشرة والأفلام والمسلسلات.',
    'search.no_results_title': 'لم يتم العثور على نتائج',
    'search.no_results_sub': 'لا توجد نتائج تطابق "{query}".',

    'favorites.title': 'المفضلة',
    'favorites.tab_all': 'الكل',
    'favorites.tab_live': 'قنوات مباشرة',
    'favorites.tab_movies': 'أفلام',
    'favorites.tab_series': 'مسلسلات',
    'favorites.empty_title': 'لا توجد عناصر في المفضلة',
    'favorites.empty_sub': 'أضف القنوات والأفلام والمسلسلات إلى المفضلة للوصول إليها بسرعة هنا.',

    'details.play': 'تشغيل',
    'details.resume': 'استئناف',
    'details.favorite': 'إضافة للمفضلة',
    'details.favorited': 'في المفضلة',
    'details.back': 'رجوع',
    'details.genre': 'النوع',
    'details.year': 'السنة',
    'details.rating': 'التقييم',
    'details.duration': 'المدة',

    'settings.title': 'الإعدادات',
    'settings.playlists_title': 'قوائم IPTV المُهيأة',
    'settings.no_playlists': 'لم تتم تهيئة أي قائمة قنوات بعد.',
    'settings.btn_refresh': 'تحديث',
    'settings.btn_delete': 'حذف',
    'settings.btn_set_active': 'تعيين كنشطة',
    'settings.active_badge': 'نشطة',
    'settings.last_updated': 'آخر تحديث: {time}',
    'settings.playback_title': 'تفضيلات التشغيل',
    'settings.auto_resume': 'استئناف التشغيل تلقائياً من آخر موضع',
    'settings.auto_next_ep': 'تشغيل الحلقة التالية تلقائياً في المسلسلات',
    'settings.cache_title': 'الذاكرة ودليل البرامج',
    'settings.btn_clear_epg': 'مسح ذاكرة دليل البرامج',
    'settings.epg_cache_cleared': 'تم مسح ذاكرة دليل البرامج بنجاح.',
    'settings.btn_clear_history': 'مسح سجل المشاهدة',
    'settings.history_cleared': 'تم مسح سجل المشاهدة.',
    'settings.diagnostics_title': 'تشخيص المزود والبث',
    'settings.diag_provider': 'حالة المزود',
    'settings.diag_live': 'القنوات المباشرة',
    'settings.diag_movies': 'الأفلام',
    'settings.diag_series': 'المسلسلات',
    'settings.diag_epg': 'حالة دليل البرامج',
    'settings.diag_server': 'الخادم',
    'settings.diag_refresh': 'تحديث المحتوى',
    'settings.language_title': 'اللغة',
    'settings.lang_en': 'English',
    'settings.lang_ar': 'العربية (Arabic)',
    'settings.about_title': 'حول مشغل IPTV المجاني',
    'settings.about_stats': 'المفضلة: {favs} • سجل المشاهدة: {hist}',
    'settings.about_disclaimer': 'مشغل IPTV المجاني هو تطبيق تشغيل مستقل. لا يوفر أو يستضيف أو يبيع أي اشتراكات أو قنوات أو وسائط محمية بحقوق النشر. يتحمل المستخدم المسؤولية الكاملة عن مصادر قوائم القنوات.',

    'player.live': 'مباشر',
    'player.previous': 'السابق',
    'player.next': 'التالي',
    'player.play': 'تشغيل',
    'player.pause': 'إيقاف مؤقت',
    'player.audio': 'الصوت',
    'player.subtitles': 'الترجمة',
    'player.aspect': 'الأبعاد',
    'player.back': 'رجوع',
    'player.back_to_channels': 'القنوات',
    'player.buffering': 'جارٍ التحميل...',
    'player.loading': 'جارٍ تشغيل البث...',
    'player.error_title': 'تعذر تشغيل هذا البث.',
    'player.error_desc': 'قد يكون البث غير متاح حالياً أو غير مدعوم.',
    'player.retry': 'إعادة المحاولة',
    'player.dev_notice': 'مشغل Samsung AVPlay غير متوفر في هذه البيئة (يعمل في وضع التطوير الافتراضي)',
    'player.no_extra_audio': 'الصوت الافتراضي',
    'player.no_subtitles': 'لا توجد ترجمة متاحة',
    'categories.search_placeholder': 'البحث في الأقسام...'
  };

  /**
   * Resolve a key path from an object, supporting both flat keys ('modal.tab_m3u')
   * and deeply nested object trees ({ modal: { tab_m3u: "value" } }).
   * @param {Object} obj
   * @param {string} keyPath
   * @returns {string|null}
   */
  function resolveKey(obj, keyPath) {
    if (!obj || typeof obj !== 'object' || !keyPath) {
      return null;
    }

    if (obj[keyPath] !== undefined) {
      return typeof obj[keyPath] === 'string' ? obj[keyPath] : String(obj[keyPath]);
    }

    if (keyPath.indexOf('.') !== -1) {
      var parts = keyPath.split('.');
      var current = obj;
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          return null;
        }
      }
      if (current !== undefined && current !== null && typeof current !== 'object') {
        return String(current);
      }
    }

    return null;
  }

  var I18n = {
    /**
     * Initialize I18n: Load saved language from storage and apply direction.
     */
    init: function () {
      var saved = 'en';
      try {
        if (window.FreeIPTV && window.FreeIPTV.Storage) {
          saved = window.FreeIPTV.Storage.getItem('language', 'en');
        } else if (window.localStorage) {
          saved = window.localStorage.getItem('freeiptv_language') || 'en';
        }
      } catch (e) {
        saved = 'en';
      }

      this.setLanguage(saved, false);

      if (window.FreeIPTV.Logger) {
        window.FreeIPTV.Logger.info('I18n initialized with locale: ' + currentLocale);
      }
    },

    /**
     * Get the currently active locale code.
     * @returns {string} ('en'|'ar')
     */
    getLanguage: function () {
      return currentLocale;
    },

    /**
     * Set the current language and update DOM direction and text.
     * @param {string} lang ('en'|'ar')
     * @param {boolean} [save=true] Whether to persist to storage
     */
    setLanguage: function (lang, save) {
      if (lang !== 'en' && lang !== 'ar') {
        lang = 'en';
      }

      currentLocale = lang;

      if (save !== false) {
        try {
          if (window.FreeIPTV && window.FreeIPTV.Storage) {
            window.FreeIPTV.Storage.setItem('language', currentLocale);
          } else if (window.localStorage) {
            window.localStorage.setItem('freeiptv_language', currentLocale);
          }
        } catch (e) {
          // Fallback
        }
      }

      this.applyDocumentDirection();
      this.updateDOM();

      if (window.FreeIPTV.Events && window.FreeIPTV.Constants) {
        window.FreeIPTV.Events.emit(window.FreeIPTV.Constants.EVENTS.LANGUAGE_CHANGED, {
          language: currentLocale,
          isRTL: this.isRTL()
        });
      }
    },

    /**
     * Apply HTML lang and dir attributes based on current locale.
     */
    applyDocumentDirection: function () {
      var html = document.documentElement;
      if (!html) return;

      var isArabic = currentLocale === 'ar';
      html.setAttribute('lang', isArabic ? 'ar' : 'en');
      html.setAttribute('dir', isArabic ? 'rtl' : 'ltr');

      if (document.body) {
        document.body.setAttribute('dir', isArabic ? 'rtl' : 'ltr');
      }
    },

    /**
     * Check if currently in RTL mode (Arabic).
     * @returns {boolean}
     */
    isRTL: function () {
      return currentLocale === 'ar';
    },

    /**
     * Translate a key with optional dynamic parameter interpolation.
     * @param {string} key
     * @param {Object} [params]
     * @returns {string}
     */
    t: function (key, params) {
      if (!key) return '';

      var dict = translations[currentLocale] || translations.en;
      var str = resolveKey(dict, key);

      if (str === null || str === undefined) {
        str = resolveKey(translations.en, key);
      }

      if (str === null || str === undefined) {
        str = key;
      }

      if (params && typeof params === 'object') {
        for (var paramKey in params) {
          if (params.hasOwnProperty(paramKey)) {
            str = str.replace(new RegExp('\\{' + paramKey + '\\}', 'g'), params[paramKey]);
          }
        }
      }

      return str;
    },

    /**
     * Load or merge a custom translation bundle into memory.
     * @param {string} locale
     * @param {Object} bundle
     */
    loadBundle: function (locale, bundle) {
      if (!locale || !bundle || typeof bundle !== 'object') return;
      translations[locale] = translations[locale] || {};
      for (var k in bundle) {
        if (bundle.hasOwnProperty(k)) {
          translations[locale][k] = bundle[k];
        }
      }
      if (currentLocale === locale) {
        this.updateDOM();
      }
    },

    /**
     * Scan DOM for elements with [data-i18n], [data-i18n-title], and [data-i18n-placeholder],
     * and update their text/attributes.
     * @param {HTMLElement} [container] Optional container root
     */
    updateDOM: function (container) {
      var rootEl = container || document;

      var elements = rootEl.querySelectorAll('[data-i18n]');
      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        var key = el.getAttribute('data-i18n');
        if (key) {
          el.textContent = this.t(key);
        }
      }

      var attrElements = rootEl.querySelectorAll('[data-i18n-title]');
      for (var j = 0; j < attrElements.length; j++) {
        var aEl = attrElements[j];
        var aKey = aEl.getAttribute('data-i18n-title');
        if (aKey) {
          aEl.setAttribute('title', this.t(aKey));
        }
      }

      var placeholderElements = rootEl.querySelectorAll('[data-i18n-placeholder]');
      for (var p = 0; p < placeholderElements.length; p++) {
        var pEl = placeholderElements[p];
        var pKey = pEl.getAttribute('data-i18n-placeholder');
        if (pKey) {
          pEl.setAttribute('placeholder', this.t(pKey));
        }
      }
    }
  };

  window.FreeIPTV.I18n = I18n;
})(window);
