package ch.gwinn.pos.data.local

import android.content.Context
import androidx.room.Room

object DatabaseClient {
    private var instance: AppDatabase? = null

    fun getInstance(context: Context): AppDatabase {
        if (instance == null) {
            instance = Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "gwinn_pos.db"
            ).fallbackToDestructiveMigration().build()
        }
        return instance!!
    }
}
