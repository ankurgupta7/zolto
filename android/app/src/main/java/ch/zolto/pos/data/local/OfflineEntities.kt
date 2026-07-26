package ch.zolto.pos.data.local

import androidx.room.*
import ch.zolto.pos.data.models.Product
import ch.zolto.pos.data.models.SaleItem
import ch.zolto.pos.data.models.SaleSummary

@Entity(tableName = "products")
data class ProductEntity(
    @PrimaryKey val id: Int,
    val name: String,
    val nameEn: String?,
    val price: String?,
    val priceRappen: Int,
    val category: String?,
    val imageUrl: String?,
    val imageKey: String?,
    val quantity: Int,
    val description: String? = null,
    val descriptionEn: String? = null,
    val visible: Boolean = true,
) {
    fun toProduct() = Product(
        id, name, nameEn, price, priceRappen, category, imageUrl, imageKey, quantity,
        description, descriptionEn, visible
    )
}

fun Product.toEntity() = ProductEntity(
    id, name, nameEn, price, priceRappen, category, imageUrl, imageKey, quantity,
    description, descriptionEn, visible
)

@Dao
interface ProductDao {
    @Query("SELECT * FROM products")
    suspend fun getAllProducts(): List<ProductEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProducts(products: List<ProductEntity>)

    @Query("DELETE FROM products")
    suspend fun deleteAllProducts()
}

@Entity(tableName = "sales")
data class SaleEntity(
    @PrimaryKey val id: Int,
    val totalRappen: Int,
    val paymentMethod: String = "card",
    val createdAt: String,
    val itemsJson: String // Store as JSON for simplicity in this port
) {
    fun toSummary(): SaleSummary {
        val items = try {
            com.google.gson.Gson().fromJson(itemsJson, Array<SaleItem>::class.java).toList()
        } catch (e: Exception) {
            emptyList()
        }
        return SaleSummary(
            id = id,
            status = "paid",
            totalRappen = totalRappen,
            totalChf = "%.2f".format(totalRappen / 100.0),
            paymentMethod = paymentMethod,
            createdAt = createdAt,
            items = items,
        )
    }
}

fun SaleSummary.toEntity() = SaleEntity(
    id, totalRappen, paymentMethod ?: "card", createdAt, com.google.gson.Gson().toJson(items)
)

@Dao
interface SalesDao {
    @Query("SELECT * FROM sales ORDER BY createdAt DESC")
    suspend fun getAllSales(): List<SaleEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSales(sales: List<SaleEntity>)

    @Query("DELETE FROM sales")
    suspend fun deleteAllSales()
}

// Version bumped to 6 for the added PendingTransactionEntity table.
// fallbackToDestructiveMigration rebuilds the cache on upgrade.
@Database(entities = [ProductEntity::class, SaleEntity::class, PendingTransactionEntity::class], version = 6)
abstract class AppDatabase : RoomDatabase() {
    abstract fun productDao(): ProductDao
    abstract fun salesDao(): SalesDao
    abstract fun pendingTransactionDao(): PendingTransactionDao
}
