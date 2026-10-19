package android.provider
object Telephony {
    object Sms {
        const val _ID = "_id"
        const val ADDRESS = "address"
        const val BODY = "body"
        const val DATE = "date"
        object Inbox { const val CONTENT_URI = "content://sms/inbox" }
    }
}
