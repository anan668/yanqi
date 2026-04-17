param(
    [string]$DevToolsBaseUrl = 'http://127.0.0.1:9222',
    [string]$TargetUrl = 'http://127.0.0.1:8000/site/home.html',
    [string]$TraceOutputPath = 'tools/qa/out/home-cdp-profile/home-trace.json',
    [string]$SummaryOutputPath = 'tools/qa/out/home-cdp-profile/home-summary.json',
    [string]$ScenarioLabel = 'default',
    [int]$ViewportWidth = 1440,
    [int]$ViewportHeight = 1200,
    [double]$CpuThrottlingRate = 1,
    [int]$PostLoadDelayMs = 1800,
    [int]$PostScrollDelayMs = 1200,
    [ValidateSet('jump', 'slow-glide')]
    [string]$ScrollProfile = 'jump'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Ensure-DirectoryForFile {
    param([string]$FilePath)

    $directory = Split-Path -Parent $FilePath
    if ($directory -and -not (Test-Path $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
}

function New-ChromeTarget {
    param(
        [string]$BaseUrl,
        [string]$Url
    )

    $escapedUrl = [Uri]::EscapeDataString($Url)
    $endpoint = "$BaseUrl/json/new?$escapedUrl"
    $response = Invoke-WebRequest -UseBasicParsing -Method Put -Uri $endpoint
    return ($response.Content | ConvertFrom-Json)
}

function Close-ChromeTarget {
    param(
        [string]$BaseUrl,
        [string]$TargetId
    )

    try {
        Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$BaseUrl/json/close/$TargetId" | Out-Null
    } catch {
        # Ignore close failures so cleanup never hides profiling results.
    }
}

function New-CdpSession {
    param([string]$WebSocketUrl)

    $webSocket = [System.Net.WebSockets.ClientWebSocket]::new()
    $null = $webSocket.ConnectAsync([Uri]$WebSocketUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

    return [pscustomobject]@{
        Socket = $webSocket
        NextId = 1
        PendingEvents = [System.Collections.Generic.List[object]]::new()
    }
}

function Close-CdpSession {
    param($Session)

    if ($null -eq $Session) {
        return
    }

    if (-not ($Session.PSObject.Properties.Name -contains 'Socket')) {
        return
    }

    try {
        if ($Session.Socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            $null = $Session.Socket.CloseAsync(
                [System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
                'done',
                [Threading.CancellationToken]::None
            ).GetAwaiter().GetResult()
        }
    } catch {
        # Best-effort close only.
    } finally {
        $Session.Socket.Dispose()
    }
}

function Receive-CdpMessage {
    param($Session)

    $buffer = New-Object byte[] 65536
    $stream = [System.IO.MemoryStream]::new()

    while ($true) {
        $segment = [ArraySegment[byte]]::new($buffer)
        $result = $Session.Socket.ReceiveAsync($segment, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

        if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
            throw "CDP websocket closed unexpectedly."
        }

        if ($result.Count -gt 0) {
            $stream.Write($buffer, 0, $result.Count)
        }

        if ($result.EndOfMessage) {
            break
        }
    }

    $json = [Text.Encoding]::UTF8.GetString($stream.ToArray())
    $stream.Dispose()
    return ($json | ConvertFrom-Json)
}

function Send-CdpRaw {
    param(
        $Session,
        [string]$Payload
    )

    $bytes = [Text.Encoding]::UTF8.GetBytes($Payload)
    $segment = [ArraySegment[byte]]::new($bytes)
    $null = $Session.Socket.SendAsync(
        $segment,
        [System.Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        [Threading.CancellationToken]::None
    ).GetAwaiter().GetResult()
}

function Invoke-Cdp {
    param(
        $Session,
        [string]$Method,
        [hashtable]$Params = @{}
    )

    $id = $Session.NextId
    $Session.NextId += 1

    $payload = @{
        id = $id
        method = $Method
        params = $Params
    } | ConvertTo-Json -Depth 100 -Compress

    Send-CdpRaw -Session $Session -Payload $payload

    while ($true) {
        $message = Receive-CdpMessage -Session $Session
        $hasId = $message.PSObject.Properties.Name -contains 'id'
        if ($hasId -and $null -ne $message.id -and [int]$message.id -eq $id) {
            if ($message.PSObject.Properties.Name -contains 'error') {
                $errorJson = $message.error | ConvertTo-Json -Depth 50 -Compress
                throw "CDP $Method failed: $errorJson"
            }
            return $message.result
        }

        $Session.PendingEvents.Add($message) | Out-Null
    }
}

function Wait-CdpEvent {
    param(
        $Session,
        [string]$Method,
        [int]$TimeoutMs = 10000
    )

    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)

    while ([DateTime]::UtcNow -lt $deadline) {
        for ($index = 0; $index -lt $Session.PendingEvents.Count; $index += 1) {
            $event = $Session.PendingEvents[$index]
            if ($event.PSObject.Properties.Name -contains 'method' -and $event.method -eq $Method) {
                $Session.PendingEvents.RemoveAt($index)
                return $event
            }
        }

        $event = Receive-CdpMessage -Session $Session
        if ($event.PSObject.Properties.Name -contains 'method' -and $event.method -eq $Method) {
            return $event
        }

        $Session.PendingEvents.Add($event) | Out-Null
    }

    throw "Timed out waiting for CDP event $Method."
}

function Invoke-CdpRuntimeJson {
    param(
        $Session,
        [string]$Expression
    )

    $result = Invoke-Cdp -Session $Session -Method 'Runtime.evaluate' -Params @{
        expression = $Expression
        awaitPromise = $true
        returnByValue = $true
    }

    return $result.result.value
}

function Convert-MetricsListToMap {
    param([object[]]$Metrics)

    $map = [ordered]@{}
    foreach ($metric in $Metrics) {
        $map[$metric.name] = $metric.value
    }
    return [pscustomobject]$map
}

function Read-TraceStream {
    param(
        $Session,
        [string]$Handle
    )

    $chunks = New-Object System.Collections.Generic.List[string]

    while ($true) {
        $chunk = Invoke-Cdp -Session $Session -Method 'IO.read' -Params @{
            handle = $Handle
        }

        if ($chunk.data) {
            $chunks.Add([string]$chunk.data) | Out-Null
        }

        if ($chunk.eof) {
            break
        }
    }

    Invoke-Cdp -Session $Session -Method 'IO.close' -Params @{
        handle = $Handle
    } | Out-Null

    return ($chunks -join '')
}

$target = $null
$session = $null

try {
    Ensure-DirectoryForFile -FilePath $TraceOutputPath
    Ensure-DirectoryForFile -FilePath $SummaryOutputPath

    $target = New-ChromeTarget -BaseUrl $DevToolsBaseUrl -Url 'about:blank'
    $session = New-CdpSession -WebSocketUrl $target.webSocketDebuggerUrl

    Invoke-Cdp -Session $session -Method 'Page.enable' | Out-Null
    Invoke-Cdp -Session $session -Method 'Runtime.enable' | Out-Null
    Invoke-Cdp -Session $session -Method 'Network.enable' | Out-Null
    Invoke-Cdp -Session $session -Method 'Network.setCacheDisabled' -Params @{
        cacheDisabled = $true
    } | Out-Null
    Invoke-Cdp -Session $session -Method 'Network.setBypassServiceWorker' -Params @{
        bypass = $true
    } | Out-Null
    Invoke-Cdp -Session $session -Method 'Performance.enable' | Out-Null
    Invoke-Cdp -Session $session -Method 'Log.enable' | Out-Null

    Invoke-Cdp -Session $session -Method 'Emulation.setDeviceMetricsOverride' -Params @{
        width = $ViewportWidth
        height = $ViewportHeight
        deviceScaleFactor = 1
        mobile = $false
    } | Out-Null

    if ($CpuThrottlingRate -gt 1) {
        Invoke-Cdp -Session $session -Method 'Emulation.setCPUThrottlingRate' -Params @{
            rate = $CpuThrottlingRate
        } | Out-Null
    }

    $perfProbeScript = @"
(() => {
    if (window.__YANQI_PERF__) {
        return;
    }

    window.__YANQI_PERF__ = {
        longTasks: [],
        lcpCandidates: [],
        layoutShifts: [],
        cls: 0
    };

    try {
        const perfState = window.__YANQI_PERF__;
        const pushLongTask = (entry) => {
            perfState.longTasks.push({
                startTime: Number(entry.startTime || 0),
                duration: Number(entry.duration || 0),
                name: String(entry.name || ''),
                containerType: Array.isArray(entry.attribution) && entry.attribution.length
                    ? String(entry.attribution[0].containerType || '')
                    : ''
            });
        };

        new PerformanceObserver((list) => {
            list.getEntries().forEach(pushLongTask);
        }).observe({ type: 'longtask', buffered: true });

        new PerformanceObserver((list) => {
            list.getEntries().forEach((entry) => {
                perfState.lcpCandidates.push({
                    startTime: Number(entry.startTime || 0),
                    renderTime: Number(entry.renderTime || 0),
                    loadTime: Number(entry.loadTime || 0),
                    size: Number(entry.size || 0),
                    url: String(entry.url || '')
                });
            });
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        new PerformanceObserver((list) => {
            list.getEntries().forEach((entry) => {
                if (entry.hadRecentInput) {
                    return;
                }

                const value = Number(entry.value || 0);
                perfState.cls += value;
                perfState.layoutShifts.push({
                    startTime: Number(entry.startTime || 0),
                    value
                });
            });
        }).observe({ type: 'layout-shift', buffered: true });
    } catch (error) {
        window.__YANQI_PERF__.observerError = String(error && error.message ? error.message : error);
    }
})();
"@

    Invoke-Cdp -Session $session -Method 'Page.addScriptToEvaluateOnNewDocument' -Params @{
        source = $perfProbeScript
    } | Out-Null

    Invoke-Cdp -Session $session -Method 'Tracing.start' -Params @{
        transferMode = 'ReturnAsStream'
        categories = 'devtools.timeline,v8,blink.user_timing,loading,rail,toplevel,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.timeline.inputs'
    } | Out-Null

    Invoke-Cdp -Session $session -Method 'Page.navigate' -Params @{
        url = $TargetUrl
    } | Out-Null

    Wait-CdpEvent -Session $session -Method 'Page.loadEventFired' -TimeoutMs 20000 | Out-Null
    Start-Sleep -Milliseconds $PostLoadDelayMs

    $metricsAfterLoad = Invoke-Cdp -Session $session -Method 'Performance.getMetrics'
    $pageSummaryAfterLoad = Invoke-CdpRuntimeJson -Session $session -Expression @"
(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paints = performance.getEntriesByType('paint').map((entry) => ({
        name: entry.name,
        startTime: Number(entry.startTime || 0)
    }));
    const resources = performance.getEntriesByType('resource');
    const sortByDuration = resources
        .map((entry) => ({
            name: entry.name,
            initiatorType: entry.initiatorType,
            duration: Number(entry.duration || 0),
            transferSize: Number(entry.transferSize || 0),
            encodedBodySize: Number(entry.encodedBodySize || 0),
            decodedBodySize: Number(entry.decodedBodySize || 0)
        }))
        .sort((left, right) => right.duration - left.duration)
        .slice(0, 12);
    const sortByTransfer = resources
        .map((entry) => ({
            name: entry.name,
            initiatorType: entry.initiatorType,
            duration: Number(entry.duration || 0),
            transferSize: Number(entry.transferSize || 0),
            encodedBodySize: Number(entry.encodedBodySize || 0),
            decodedBodySize: Number(entry.decodedBodySize || 0)
        }))
        .sort((left, right) => right.transferSize - left.transferSize)
        .slice(0, 12);

    return {
        title: document.title,
        homePerformanceMode: document.body?.dataset?.homePerformance || '',
        browserContext: {
            userAgent: navigator.userAgent,
            deviceMemory: typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null,
            hardwareConcurrency: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
            maxTouchPoints: typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : null,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            coarsePointer: window.matchMedia?.('(any-pointer: coarse)')?.matches || false,
            finePointer: window.matchMedia?.('(any-pointer: fine)')?.matches || false,
            reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false
        },
        resolvedHomeProfile: typeof resolveHomePerformanceProfile === 'function'
            ? resolveHomePerformanceProfile()
            : null,
        domNodeCount: document.getElementsByTagName('*').length,
        imageCount: document.images.length,
        scriptCount: document.scripts.length,
        stageAnimatedCount: document.querySelectorAll('.hero-ocean-layers span').length,
        sectionCounts: {
            bambooCards: document.querySelectorAll('.bamboo-card').length,
            curatedNavButtons: document.querySelectorAll('#destinationsGrid .curated-nav-button').length,
            diveMatchFilters: document.querySelectorAll('#diveMatchFilters .dive-match-filter').length,
            diveMatchCards: document.querySelectorAll('#diveMatchDisplay .dive-match-spot-card').length
        },
        nav: nav ? {
            domInteractive: Number(nav.domInteractive || 0),
            domContentLoadedEnd: Number(nav.domContentLoadedEventEnd || 0),
            loadEventEnd: Number(nav.loadEventEnd || 0),
            transferSize: Number(nav.transferSize || 0),
            encodedBodySize: Number(nav.encodedBodySize || 0),
            decodedBodySize: Number(nav.decodedBodySize || 0)
        } : null,
        paints,
        resources: {
            count: resources.length,
            transferSize: resources.reduce((sum, entry) => sum + Number(entry.transferSize || 0), 0),
            encodedBodySize: resources.reduce((sum, entry) => sum + Number(entry.encodedBodySize || 0), 0),
            decodedBodySize: resources.reduce((sum, entry) => sum + Number(entry.decodedBodySize || 0), 0),
            slowest: sortByDuration,
            heaviest: sortByTransfer
        },
        perfObserver: window.__YANQI_PERF__ || null
    };
})()
"@

    $scrollProfileJson = $ScrollProfile | ConvertTo-Json -Compress

    Invoke-CdpRuntimeJson -Session $session -Expression @"
(async () => {
    const scrollProfile = $scrollProfileJson;
    const totalDistance = Math.max(
        0,
        (document.documentElement.scrollHeight || document.body.scrollHeight || 0) - window.innerHeight
    );
    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    if (scrollProfile === 'slow-glide') {
        const stepPx = Math.max(Math.round(window.innerHeight * 0.028), 24);
        const stepDelayMs = 28;
        const pauseEvery = 10;
        let nextY = 0;
        let stepIndex = 0;

        while (nextY < totalDistance) {
            nextY = Math.min(totalDistance, nextY + stepPx);
            window.scrollTo({ top: nextY, left: 0, behavior: 'instant' });
            stepIndex += 1;
            await wait(stepDelayMs);

            if (stepIndex % pauseEvery === 0 && nextY < totalDistance) {
                await wait(48);
            }
        }
    } else {
        const steps = 6;
        for (let index = 1; index <= steps; index += 1) {
            const nextY = Math.round(totalDistance * (index / steps));
            window.scrollTo({ top: nextY, left: 0, behavior: 'instant' });
            await wait(180);
        }
    }

    await wait(scrollProfile === 'slow-glide' ? 320 : 450);
    return {
        scrollProfile,
        finalScrollY: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight || document.body.scrollHeight || 0
    };
})()
"@ | Out-Null

    Start-Sleep -Milliseconds $PostScrollDelayMs

    $metricsAfterScroll = Invoke-Cdp -Session $session -Method 'Performance.getMetrics'
    $pageSummaryAfterScroll = Invoke-CdpRuntimeJson -Session $session -Expression @"
(() => {
    const perfState = window.__YANQI_PERF__ || {
        longTasks: [],
        lcpCandidates: [],
        layoutShifts: [],
        cls: 0
    };

    return {
        scrollProfile: $scrollProfileJson,
        scrollY: window.scrollY,
        currentHomeLayer: document.body?.dataset?.currentHomeLayer || '',
        guideVisible: document.getElementById('homeSeaGuide')?.classList.contains('is-visible') || false,
        guideDeep: document.getElementById('homeSeaGuide')?.classList.contains('is-deep') || false,
        curatedMounted: document.querySelectorAll('#destinationsGrid .curated-nav-button').length,
        diveMatchMounted: document.querySelectorAll('#diveMatchFilters .dive-match-filter').length,
        longTaskCount: perfState.longTasks.length,
        topLongTasks: perfState.longTasks
            .slice()
            .sort((left, right) => right.duration - left.duration)
            .slice(0, 12),
        cls: Number(perfState.cls || 0),
        layoutShiftCount: perfState.layoutShifts.length,
        lcpCandidates: perfState.lcpCandidates
            .slice()
            .sort((left, right) => right.startTime - left.startTime)
            .slice(-5)
    };
})()
"@

    Invoke-Cdp -Session $session -Method 'Tracing.end' | Out-Null
    $traceComplete = Wait-CdpEvent -Session $session -Method 'Tracing.tracingComplete' -TimeoutMs 30000
    $traceJson = Read-TraceStream -Session $session -Handle $traceComplete.params.stream

    [System.IO.File]::WriteAllText((Resolve-Path '.').Path + "\" + $TraceOutputPath.Replace('/', '\'), $traceJson, [Text.Encoding]::UTF8)

    $summary = [ordered]@{
        generatedAt = (Get-Date).ToString('s')
        scenarioLabel = $ScenarioLabel
        scrollProfile = $ScrollProfile
        targetUrl = $TargetUrl
        viewport = [ordered]@{
            width = $ViewportWidth
            height = $ViewportHeight
        }
        cpuThrottlingRate = $CpuThrottlingRate
        metricsAfterLoad = (Convert-MetricsListToMap -Metrics $metricsAfterLoad.metrics)
        metricsAfterScroll = (Convert-MetricsListToMap -Metrics $metricsAfterScroll.metrics)
        pageSummaryAfterLoad = $pageSummaryAfterLoad
        pageSummaryAfterScroll = $pageSummaryAfterScroll
        tracePath = $TraceOutputPath.Replace('/', '\')
    }

    $summaryJson = $summary | ConvertTo-Json -Depth 100
    [System.IO.File]::WriteAllText((Resolve-Path '.').Path + "\" + $SummaryOutputPath.Replace('/', '\'), $summaryJson, [Text.Encoding]::UTF8)

    Write-Output $summaryJson
} finally {
    if ($null -ne $session) {
        Close-CdpSession -Session $session
    }
    if ($null -ne $target) {
        Close-ChromeTarget -BaseUrl $DevToolsBaseUrl -TargetId $target.id
    }
}
