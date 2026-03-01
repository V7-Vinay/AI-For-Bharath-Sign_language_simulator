package com.accessibility.ai.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * Offline queue for handling requests when network is unavailable
 */
@Entity(tableName = "offline_requests")
data class QueuedRequest(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val type: String, // "transcription" or "translation"
    val data: String, // JSON serialized data
    val timestamp: Long,
    val retryCount: Int = 0
)

@Dao
interface OfflineQueueDao {
    @Query("SELECT * FROM offline_requests ORDER BY timestamp ASC")
    suspend fun getAllRequests(): List<QueuedRequest>
    
    @Insert
    suspend fun insertRequest(request: QueuedRequest)
    
    @Query("DELETE FROM offline_requests WHERE id = :id")
    suspend fun deleteRequest(id: Long)
    
    @Query("DELETE FROM offline_requests")
    suspend fun clearAll()
    
    @Query("UPDATE offline_requests SET retryCount = :retryCount WHERE id = :id")
    suspend fun updateRetryCount(id: Long, retryCount: Int)
}

@Database(entities = [QueuedRequest::class], version = 1)
abstract class OfflineQueueDatabase : RoomDatabase() {
    abstract fun offlineQueueDao(): OfflineQueueDao
}

class OfflineQueue(private val context: Context) {
    
    private val database = Room.databaseBuilder(
        context,
        OfflineQueueDatabase::class.java,
        "offline_queue_db"
    ).build()
    
    private val dao = database.offlineQueueDao()
    private val scope = CoroutineScope(Dispatchers.IO)
    
    private val _isOnline = MutableStateFlow(false)
    val isOnline: StateFlow<Boolean> = _isOnline
    
    private val connectivityManager = 
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    
    init {
        // Monitor network connectivity
        monitorNetworkConnectivity()
        
        // Check initial connectivity
        _isOnline.value = checkNetworkConnectivity()
    }
    
    /**
     * Queue a request when network is unavailable
     */
    suspend fun queueRequest(type: String, data: String) {
        val request = QueuedRequest(
            type = type,
            data = data,
            timestamp = System.currentTimeMillis()
        )
        dao.insertRequest(request)
    }
    
    /**
     * Process queued requests when connectivity is restored
     */
    suspend fun processQueue(
        onProcess: suspend (QueuedRequest) -> Boolean
    ) {
        if (!_isOnline.value) return
        
        val requests = dao.getAllRequests()
        
        for (request in requests) {
            try {
                val success = onProcess(request)
                
                if (success) {
                    // Remove from queue on success
                    dao.deleteRequest(request.id)
                } else {
                    // Increment retry count
                    dao.updateRetryCount(request.id, request.retryCount + 1)
                    
                    // Remove if max retries exceeded
                    if (request.retryCount >= 3) {
                        dao.deleteRequest(request.id)
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
                // Increment retry count on error
                dao.updateRetryCount(request.id, request.retryCount + 1)
            }
        }
    }
    
    /**
     * Get number of queued requests
     */
    suspend fun getQueueSize(): Int {
        return dao.getAllRequests().size
    }
    
    /**
     * Clear all queued requests
     */
    suspend fun clearQueue() {
        dao.clearAll()
    }
    
    /**
     * Check if network is available
     */
    private fun checkNetworkConnectivity(): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
               capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
    
    /**
     * Monitor network connectivity changes
     */
    private fun monitorNetworkConnectivity() {
        val networkRequest = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        
        val networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                _isOnline.value = true
                
                // Process queued requests when connectivity is restored
                scope.launch {
                    processQueue { request ->
                        // This will be implemented by the caller
                        true
                    }
                }
            }
            
            override fun onLost(network: Network) {
                _isOnline.value = false
            }
        }
        
        connectivityManager.registerNetworkCallback(networkRequest, networkCallback)
    }
}
