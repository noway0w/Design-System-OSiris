<?php
/**
 * Emit the static platform top bar HTML fragment.
 */
declare(strict_types=1);

function platform_topbar_render_static(): void
{
    $path = __DIR__ . '/platform-topbar-static.html';
    if (!is_readable($path)) {
        return;
    }
    readfile($path);
}
