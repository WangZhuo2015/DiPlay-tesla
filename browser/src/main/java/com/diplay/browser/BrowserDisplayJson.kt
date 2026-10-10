package com.diplay.browser

import org.json.JSONObject

object BrowserDisplayJson {
    fun encode(display: BrowserDisplay): JSONObject = JSONObject()
        .put("mode", display.mode.name)
        .put("right", resolution(display.right))
        .put("full", resolution(display.full))
        .put("fps", display.fps).put("jpegQuality", display.jpegQuality)

    fun decode(json: JSONObject): BrowserDisplay {
        fun size(name: String) = json.getJSONObject(name).let {
            BrowserResolution(it.getInt("width"), it.getInt("height"))
        }
        return BrowserDisplay(BrowserMode.valueOf(json.getString("mode")), size("right"), size("full"),
            json.getInt("fps"), json.getInt("jpegQuality"))
    }
    private fun resolution(size: BrowserResolution) = JSONObject().put("width", size.width).put("height", size.height)
}
