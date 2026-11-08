package com.uvelan.ultimateapp

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import androidx.annotation.RequiresApi

internal data class RoutineShortcuts(val limit: Int, val published: List<String>, val retry: Boolean = false)

internal object RoutineReminderShortcuts {
    private const val PREFIX = "routine_reminder_"

    fun sync(context: Context, presets: List<ReminderPreset>): RoutineShortcuts {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return RoutineShortcuts(0, emptyList())
        return publish(context, presets)
    }

    @RequiresApi(Build.VERSION_CODES.N_MR1)
    private fun publish(context: Context, presets: List<ReminderPreset>): RoutineShortcuts {
        val manager = context.getSystemService(ShortcutManager::class.java)
        val launcher = ComponentName(context, MainActivity::class.java)
        val current = manager.dynamicShortcuts
        val otherCount = current.count { it.activity == launcher && !it.id.startsWith(PREFIX) }
        val staticCount = manager.manifestShortcuts.count { it.activity == launcher }
        val limit = (manager.maxShortcutCountPerActivity - staticCount - otherCount).coerceAtLeast(0)
        val selected = presets.filter { it.routineEnabled }.take(limit)
        val existing = current.filter { it.id.startsWith(PREFIX) }.associateBy { it.id }
        val expected = selected.map { PREFIX + it.id }.toSet()
        val obsolete = existing.keys - expected
        if (obsolete.isNotEmpty()) manager.removeDynamicShortcuts(obsolete.toList())
        val changed = selected.filter { existing[PREFIX + it.id]?.shortLabel?.toString() != it.title }
        if (changed.isNotEmpty() && !manager.addDynamicShortcuts(changed.map { shortcut(context, launcher, it) })) {
            val published = selected.filter { existing.containsKey(PREFIX + it.id) }.map { it.id }
            return RoutineShortcuts(limit, published, retry = true)
        }
        return RoutineShortcuts(limit, selected.map { it.id })
    }

    @RequiresApi(Build.VERSION_CODES.N_MR1)
    private fun shortcut(context: Context, launcher: ComponentName, preset: ReminderPreset): ShortcutInfo =
        ShortcutInfo.Builder(context, PREFIX + preset.id)
            .setActivity(launcher)
            .setShortLabel(preset.title)
            .setIcon(Icon.createWithResource(context, R.mipmap.ic_launcher))
            .setIntent(
                Intent(context, RoutineReminderShortcutActivity::class.java)
                    .setAction(RoutineReminder.START_NAMED)
                    .setData(Uri.fromParts("routine-reminder", preset.id, null))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            .build()
}
