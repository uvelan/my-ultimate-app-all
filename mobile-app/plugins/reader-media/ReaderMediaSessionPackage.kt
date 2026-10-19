package com.uvelan.ultimateapp

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

class ReaderMediaSessionPackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(ReaderMediaSessionModule(context))
    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<View, ReactShadowNode<*>>> = emptyList()
}
