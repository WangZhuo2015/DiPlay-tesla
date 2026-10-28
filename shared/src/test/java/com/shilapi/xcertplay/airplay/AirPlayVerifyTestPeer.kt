package com.shilapi.xcertplay.airplay

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue

/** Synthetic, locally trusted controller; completes real X25519/Ed25519 pair-verify. */
internal class AirPlayVerifyTestPeer(pairings: PairingStore) {
    val identifier = "test-controller"
    private val identity = AirPlayCrypto.ed25519Generate()
    private val ephemeral = AirPlayCrypto.x25519Generate()
    private lateinit var serverPublic: ByteArray
    lateinit var shared: ByteArray
        private set
    private lateinit var verifyKey: ByteArray

    init { pairings.save(identifier, identity.publicKey) }

    fun m1() = Tlv8Codec.encode(listOf(Tlv8Item(6, byteArrayOf(1)), Tlv8Item(3, ephemeral.publicKey)))

    fun receiveM2(body: ByteArray) {
        val tlv = Tlv8Codec.decode(body)
        assertNull(tlv[7])
        serverPublic = tlv[3]!!
        shared = AirPlayCrypto.x25519Shared(ephemeral.privateKey, serverPublic)
        verifyKey = derive("Pair-Verify-Encrypt-Salt", "Pair-Verify-Encrypt-Info")
    }

    fun m3(validSignature: Boolean = true): ByteArray {
        val signature = AirPlayCrypto.ed25519Sign(identity.privateKey,
            ephemeral.publicKey + identifier.toByteArray(Charsets.UTF_8) + serverPublic)
        if (!validSignature) signature[0] = (signature[0].toInt() xor 1).toByte()
        val sub = Tlv8Codec.encode(listOf(Tlv8Item(1, identifier.toByteArray(Charsets.UTF_8)), Tlv8Item(10, signature)))
        return Tlv8Codec.encode(listOf(Tlv8Item(6, byteArrayOf(3)),
            Tlv8Item(5, AirPlayCrypto.chachaSeal(verifyKey, AirPlayCrypto.nonceLabel("PV-Msg03"), sub))))
    }

    fun controlCipher() = ControlCipher(derive("Control-Salt", "Control-Read-Encryption-Key"),
        derive("Control-Salt", "Control-Write-Encryption-Key"))
    fun eventCipher() = ControlCipher(derive("Events-Salt", "Events-Write-Encryption-Key"),
        derive("Events-Salt", "Events-Read-Encryption-Key"))
    private fun derive(salt: String, info: String) =
        AirPlayCrypto.hkdfSha512(shared, salt.toByteArray(Charsets.US_ASCII), info.toByteArray(Charsets.US_ASCII))
}

/** For focused media tests that call the session handler without starting its control socket. */
internal fun AirPlaySession.verifyForTest(): AirPlayVerifyTestPeer {
    val pairings = AirPlaySession::class.java.getDeclaredField("pairings").apply { isAccessible = true }
        .get(this) as PairingStore
    val peer = AirPlayVerifyTestPeer(pairings)
    peer.receiveM2(pairVerify.handle(peer.m1()))
    assertNull(Tlv8Codec.decode(pairVerify.handle(peer.m3()))[7])
    assertTrue(pairVerify.isVerified)
    assertArrayEquals(peer.shared, sharedSecret)
    return peer
}
