# Resolve Android targets, never host libraries, including libSRTP's crypto backend.
if(NOT TARGET mbedcrypto)
    message(FATAL_ERROR "Build the pinned MbedTLS dependency first")
endif()
get_target_property(MBEDTLS_INCLUDE_DIRS mbedcrypto INTERFACE_INCLUDE_DIRECTORIES)
set(MBEDTLS_LIBRARIES mbedtls mbedx509 mbedcrypto)
set(MBEDTLS_FOUND TRUE)
